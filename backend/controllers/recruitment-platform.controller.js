const db = require('../config/db');

const clean = value => String(value || '').trim();
const integer = value => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const isOneOf = (value, choices) => choices.includes(value) ? value : null;
const requestStatuses = ['draft', 'submitted', 'approved', 'rejected', 'converted'];
const approvalStatuses = ['draft', 'pending', 'approved', 'rejected'];
const requisitionStatuses = ['draft', 'open', 'closed'];
const postingStatuses = ['draft', 'published', 'closed'];
const postingChannels = ['internal', 'company-site', 'external'];
const defaultPipelineStages = [
  ['submitted', 'Applications', 10], ['screening', 'Screening', 20], ['reviewing', 'Reviewing', 25],
  ['shortlisted', 'Shortlisting', 30], ['assessment', 'Assessments', 40], ['interview', 'Interviews', 50],
  ['reference-checks', 'Reference Checks', 60], ['selection', 'Selection', 70], ['offer', 'Job Offer', 80],
  ['offer-acceptance', 'Offer Acceptance', 90], ['pre-employment', 'Pre-Employment', 100], ['hired', 'Hired', 110], ['rejected', 'Rejected', 999]
];

async function ensurePipelineStages(companyId) {
  await db.query(
    `INSERT INTO recruitment_stages (company_id,stage_key,name,sort_order,is_system) VALUES ${defaultPipelineStages.map((_, index) => `($1,$${index * 3 + 2},$${index * 3 + 3},$${index * 3 + 4},TRUE)`).join(',')} ON CONFLICT (company_id,stage_key) DO NOTHING`,
    [companyId, ...defaultPipelineStages.flatMap(([key, name, order]) => [key, name, order])]
  );
}

async function companyDepartment(companyId, departmentId) {
  const id = integer(departmentId);
  if (!id) return null;
  const result = await db.query('SELECT id FROM departments WHERE id=$1 AND company_id=$2', [id, companyId]);
  if (!result.rows.length) throw new Error('Choose a department in your company');
  return id;
}

async function companyEmployee(companyId, employeeId) {
  const id = integer(employeeId);
  if (!id) return null;
  const result = await db.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2', [id, companyId]);
  if (!result.rows.length) throw new Error('Choose a staff member in your company');
  return id;
}

function requestData(body) {
  const title = clean(body.title);
  const headcount = integer(body.headcount) || 1;
  if (!title) throw new Error('A position title is required');
  return {
    title,
    headcount,
    employmentType: clean(body.employment_type) || null,
    location: clean(body.location) || null,
    justification: clean(body.justification) || null,
    targetStartDate: body.target_start_date || null
  };
}

function requisitionData(body) {
  const title = clean(body.title);
  const headcount = integer(body.headcount) || 1;
  if (!title) throw new Error('A requisition title is required');
  return {
    title,
    headcount,
    description: clean(body.description) || null,
    employmentType: clean(body.employment_type) || null,
    location: clean(body.location) || null,
    closesAt: body.closes_at || null,
    targetStartDate: body.target_start_date || null
  };
}

async function requestRelations(companyId, body) {
  return {
    departmentId: await companyDepartment(companyId, body.department_id),
    hiringManagerId: await companyEmployee(companyId, body.hiring_manager_id)
  };
}

async function requisitionRelations(companyId, body) {
  return {
    departmentId: await companyDepartment(companyId, body.department_id),
    hiringManagerId: await companyEmployee(companyId, body.hiring_manager_id),
    requestId: integer(body.request_id)
  };
}

async function isDepartmentHead(companyId, employeeId, departmentId) {
  if (!departmentId) return false;
  const result = await db.query(
    'SELECT id FROM departments WHERE company_id=$1 AND id=$2 AND manager_id=$3',
    [companyId, departmentId, employeeId]
  );
  return Boolean(result.rows.length);
}

async function canManageRequisition(req, requisitionId) {
  if (req.user.role === 'admin') return true;
  const result = await db.query(
    `SELECT r.id FROM job_requisitions r
       JOIN departments d ON d.id=r.department_id
      WHERE r.id=$1 AND r.company_id=$2 AND d.manager_id=$3`,
    [requisitionId, req.user.company_id, req.user.id]
  );
  return Boolean(result.rows.length);
}

async function syncRequisitionPublicationStatus(companyId, requisitionId) {
  const publishing = await db.query(
    "SELECT COUNT(*) FILTER (WHERE status='published')::int AS active FROM job_postings WHERE company_id=$1 AND requisition_id=$2",
    [companyId, requisitionId]
  );
  const active = Number(publishing.rows[0]?.active || 0);
  if (active) {
    await db.query("UPDATE job_requisitions SET status='open',updated_at=NOW() WHERE id=$1 AND company_id=$2", [requisitionId, companyId]);
  }
}

const requestSelect = `SELECT rr.*, d.name AS department_name,
  CONCAT(requester.first_name,' ',requester.last_name) AS requester_name,
  CONCAT(manager.first_name,' ',manager.last_name) AS hiring_manager_name,
  CONCAT(reviewer.first_name,' ',reviewer.last_name) AS reviewer_name,
  r.requisition_code, r.title AS converted_requisition_title
  FROM recruitment_requests rr
  LEFT JOIN departments d ON d.id=rr.department_id
  LEFT JOIN employees requester ON requester.id=rr.requested_by_id
  LEFT JOIN employees manager ON manager.id=rr.hiring_manager_id
  LEFT JOIN employees reviewer ON reviewer.id=rr.reviewed_by_id
  LEFT JOIN job_requisitions r ON r.id=rr.converted_requisition_id`;

const requisitionSelect = `SELECT r.*, d.name AS department_name,
  CONCAT(manager.first_name,' ',manager.last_name) AS manager_name,
  rr.request_number, rr.status AS request_status,
  COUNT(DISTINCT a.id)::int AS applicant_count,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status='published')::int AS published_posting_count
  FROM job_requisitions r
  LEFT JOIN departments d ON d.id=r.department_id
  LEFT JOIN employees manager ON manager.id=r.hiring_manager_id
  LEFT JOIN recruitment_requests rr ON rr.id=r.request_id
  LEFT JOIN candidate_applications a ON a.requisition_id=r.id
  LEFT JOIN job_postings p ON p.requisition_id=r.id`;

exports.getOverview = async (req, res) => { try {
  const company = req.user.company_id;
  const [requestCounts, requisitionCounts, postingCounts, candidateCounts, queues] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='submitted')::int AS awaiting_review FROM recruitment_requests WHERE company_id=$1", [company]),
    db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE approval_status='pending')::int AS awaiting_approval,COUNT(*) FILTER (WHERE status='open')::int AS open FROM job_requisitions WHERE company_id=$1", [company]),
    db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status='published')::int AS published FROM job_postings WHERE company_id=$1", [company]),
    db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE status NOT IN ('hired','rejected'))::int AS active FROM candidate_applications WHERE company_id=$1", [company]),
    db.query(`SELECT 'request' AS type,rr.id,rr.title,rr.created_at,rr.status,NULL::timestamptz AS scheduled_at
              FROM recruitment_requests rr WHERE rr.company_id=$1 AND rr.status='submitted'
              UNION ALL
              SELECT 'requisition',r.id,r.title,r.created_at,r.approval_status,NULL::timestamptz
              FROM job_requisitions r WHERE r.company_id=$1 AND r.approval_status='pending'
              UNION ALL
              SELECT 'interview',i.application_id,COALESCE(j.title,a.role_applied,a.full_name),i.created_at,i.status,i.scheduled_at
              FROM candidate_interviews i JOIN candidate_applications a ON a.id=i.application_id
              LEFT JOIN job_requisitions j ON j.id=a.requisition_id
              WHERE a.company_id=$1 AND i.status='scheduled' AND i.scheduled_at>=NOW()
              ORDER BY scheduled_at NULLS LAST,created_at DESC LIMIT 8`, [company])
  ]);
  res.json({
    requests: requestCounts.rows[0], requisitions: requisitionCounts.rows[0],
    postings: postingCounts.rows[0], candidates: candidateCounts.rows[0], queue: queues.rows
  });
} catch (error) { res.status(500).json({ error: 'Could not load recruitment overview' }); } };

exports.getRequests = async (req, res) => { try {
  const status = isOneOf(clean(req.query.status), requestStatuses);
  const result = await db.query(
    `${requestSelect} WHERE rr.company_id=$1 ${status ? 'AND rr.status=$2' : ''} ORDER BY rr.created_at DESC`,
    status ? [req.user.company_id, status] : [req.user.company_id]
  );
  res.json(result.rows);
} catch (error) { res.status(500).json({ error: 'Could not load recruitment requests' }); } };

exports.getRequest = async (req, res) => { try {
  const request = await db.query(`${requestSelect} WHERE rr.id=$1 AND rr.company_id=$2`, [req.params.id, req.user.company_id]);
  if (!request.rows.length) return res.status(404).json({ error: 'Recruitment request not found' });
  const approvals = await db.query(`SELECT a.*,CONCAT(e.first_name,' ',e.last_name) AS reviewer_name
    FROM recruitment_request_approvals a LEFT JOIN employees e ON e.id=a.reviewer_id
    WHERE a.request_id=$1 ORDER BY a.decided_at DESC`, [req.params.id]);
  res.json({ ...request.rows[0], approvals: approvals.rows });
} catch (error) { res.status(500).json({ error: 'Could not load recruitment request' }); } };

exports.createRequest = async (req, res) => { try {
  const data = requestData(req.body);
  const relations = await requestRelations(req.user.company_id, req.body);
  const status = ['draft', 'submitted'].includes(req.body.status) ? req.body.status : 'draft';
  const created = await db.query(`INSERT INTO recruitment_requests
    (company_id,title,department_id,requested_by_id,hiring_manager_id,headcount,employment_type,location,justification,target_start_date,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.company_id, data.title, relations.departmentId, req.user.id, relations.hiringManagerId, data.headcount, data.employmentType, data.location, data.justification, data.targetStartDate, status]
  );
  const numbered = await db.query("UPDATE recruitment_requests SET request_number='RR-' || LPAD(id::text,6,'0') WHERE id=$1 RETURNING *", [created.rows[0].id]);
  if (status === 'submitted') await db.query('INSERT INTO recruitment_request_approvals(request_id,reviewer_id,decision,note) VALUES($1,$2,$3,$4)', [created.rows[0].id, req.user.id, 'submitted', null]);
  res.status(201).json(numbered.rows[0]);
} catch (error) { res.status(400).json({ error: error.message || 'Could not create recruitment request' }); } };

exports.updateRequest = async (req, res) => { try {
  const data = requestData(req.body);
  const relations = await requestRelations(req.user.company_id, req.body);
  const result = await db.query(`UPDATE recruitment_requests SET title=$1,department_id=$2,hiring_manager_id=$3,headcount=$4,
      employment_type=$5,location=$6,justification=$7,target_start_date=$8,updated_at=NOW()
    WHERE id=$9 AND company_id=$10 AND status IN ('draft','rejected') RETURNING *`,
    [data.title, relations.departmentId, relations.hiringManagerId, data.headcount, data.employmentType, data.location, data.justification, data.targetStartDate, req.params.id, req.user.company_id]
  );
  if (!result.rows.length) return res.status(409).json({ error: 'Only draft or rejected requests can be edited' });
  res.json(result.rows[0]);
} catch (error) { res.status(400).json({ error: error.message || 'Could not update recruitment request' }); } };

async function changeRequestStatus(req, res, action) {
  const transitions = {
    submit: { from: ['draft', 'rejected'], to: 'submitted', decision: 'submitted' },
    approve: { from: ['submitted'], to: 'approved', decision: 'approved' },
    reject: { from: ['submitted'], to: 'rejected', decision: 'rejected' }
  };
  const transition = transitions[action];
  try {
    const note = clean(req.body.note) || null;
    const result = await db.query(`UPDATE recruitment_requests SET status=$1,reviewed_by_id=$2,reviewed_at=NOW(),reviewer_note=$3,updated_at=NOW()
      WHERE id=$4 AND company_id=$5 AND status = ANY($6::varchar[]) RETURNING *`,
      [transition.to, req.user.id, note, req.params.id, req.user.company_id, transition.from]
    );
    if (!result.rows.length) return res.status(409).json({ error: 'This request cannot be moved to that status' });
    await db.query('INSERT INTO recruitment_request_approvals(request_id,reviewer_id,decision,note) VALUES($1,$2,$3,$4)', [req.params.id, req.user.id, transition.decision, note]);
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Could not update recruitment request' }); }
}
exports.submitRequest = (req, res) => changeRequestStatus(req, res, 'submit');
exports.approveRequest = (req, res) => changeRequestStatus(req, res, 'approve');
exports.rejectRequest = (req, res) => changeRequestStatus(req, res, 'reject');

exports.convertRequest = async (req, res) => {
  let client;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const request = await client.query('SELECT * FROM recruitment_requests WHERE id=$1 AND company_id=$2 AND status=$3 AND converted_requisition_id IS NULL FOR UPDATE', [req.params.id, req.user.company_id, 'approved']);
    if (!request.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only an unconverted approved request can become a requisition' }); }
    const source = request.rows[0];
    const requisition = await client.query(`INSERT INTO job_requisitions
      (company_id,title,department_id,hiring_manager_id,location,employment_type,status,request_id,headcount,approval_status,target_start_date)
      VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,'draft',$9) RETURNING *`,
      [req.user.company_id, source.title, source.department_id, source.hiring_manager_id, source.location, source.employment_type, source.id, source.headcount, source.target_start_date]
    );
    const numbered = await client.query("UPDATE job_requisitions SET requisition_code='REQ-' || LPAD(id::text,6,'0') WHERE id=$1 RETURNING *", [requisition.rows[0].id]);
    await client.query("UPDATE recruitment_requests SET status='converted',converted_requisition_id=$1,updated_at=NOW() WHERE id=$2", [requisition.rows[0].id, source.id]);
    await client.query('COMMIT');
    res.status(201).json(numbered.rows[0]);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Could not create a job requisition from this request' });
  } finally { if (client) client.release(); }
};

exports.getRequisitions = async (req, res) => { try {
  const approvalStatus = isOneOf(clean(req.query.approval_status), approvalStatuses);
  const params = [req.user.company_id];
  const filters = ['r.company_id=$1'];
  if (approvalStatus) {
    params.push(approvalStatus);
    filters.push(`r.approval_status=$${params.length}`);
  }
  if (req.user.role !== 'admin') {
    params.push(req.user.id);
    filters.push(`d.manager_id=$${params.length}`);
  }
  const result = await db.query(
    `${requisitionSelect} WHERE ${filters.join(' AND ')}
      GROUP BY r.id,d.name,manager.first_name,manager.last_name,rr.request_number,rr.status ORDER BY r.created_at DESC`,
    params
  );
  res.json(result.rows);
} catch (error) { res.status(500).json({ error: 'Could not load job requisitions' }); } };

exports.getRequisition = async (req, res) => { try {
  const result = await db.query(`${requisitionSelect} WHERE r.id=$1 AND r.company_id=$2
    AND ($3='admin' OR d.manager_id=$4)
    GROUP BY r.id,d.name,manager.first_name,manager.last_name,rr.request_number,rr.status`, [req.params.id, req.user.company_id, req.user.role, req.user.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Job requisition not found' });
  res.json(result.rows[0]);
} catch (error) { res.status(500).json({ error: 'Could not load job requisition' }); } };

exports.createRequisition = async (req, res) => { try {
  const data = requisitionData(req.body);
  const relations = await requisitionRelations(req.user.company_id, req.body);
  if (req.user.role !== 'admin') {
    if (!await isDepartmentHead(req.user.company_id, req.user.id, relations.departmentId)) {
      return res.status(403).json({ error: 'Only the assigned department head can create a requisition for that department' });
    }
    relations.hiringManagerId = req.user.id;
  }
  if (relations.requestId) {
    const request = await db.query("SELECT id FROM recruitment_requests WHERE id=$1 AND company_id=$2 AND status IN ('approved','converted')", [relations.requestId, req.user.company_id]);
    if (!request.rows.length) throw new Error('Choose an approved recruitment request');
  }
  const approvalStatus = ['draft', 'pending'].includes(req.body.approval_status) ? req.body.approval_status : 'draft';
  const status = approvalStatus === 'approved' && requisitionStatuses.includes(req.body.status) ? req.body.status : 'draft';
  const created = await db.query(`INSERT INTO job_requisitions
    (company_id,title,department_id,hiring_manager_id,description,location,employment_type,status,closes_at,request_id,headcount,approval_status,target_start_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.user.company_id, data.title, relations.departmentId, relations.hiringManagerId, data.description, data.location, data.employmentType, status, data.closesAt, relations.requestId, data.headcount, approvalStatus, data.targetStartDate]
  );
  const numbered = await db.query("UPDATE job_requisitions SET requisition_code='REQ-' || LPAD(id::text,6,'0') WHERE id=$1 RETURNING *", [created.rows[0].id]);
  res.status(201).json(numbered.rows[0]);
} catch (error) { res.status(400).json({ error: error.message || 'Could not create job requisition' }); } };

exports.updateRequisition = async (req, res) => { try {
  const data = requisitionData(req.body);
  const relations = await requisitionRelations(req.user.company_id, req.body);
  if (req.user.role !== 'admin' && !await isDepartmentHead(req.user.company_id, req.user.id, relations.departmentId)) {
    return res.status(403).json({ error: 'Only the assigned department head can update this requisition' });
  }
  const result = await db.query(`UPDATE job_requisitions SET title=$1,department_id=$2,hiring_manager_id=$3,description=$4,
      location=$5,employment_type=$6,closes_at=$7,headcount=$8,target_start_date=$9,updated_at=NOW()
    WHERE id=$10 AND company_id=$11 AND status<>'closed'
      AND ($12='admin' OR EXISTS (SELECT 1 FROM departments d WHERE d.id=job_requisitions.department_id AND d.manager_id=$13)) RETURNING *`,
    [data.title, relations.departmentId, req.user.role === 'admin' ? relations.hiringManagerId : req.user.id, data.description, data.location, data.employmentType, data.closesAt, data.headcount, data.targetStartDate, req.params.id, req.user.company_id, req.user.role, req.user.id]
  );
  if (!result.rows.length) return res.status(409).json({ error: 'Closed requisitions cannot be edited' });
  res.json(result.rows[0]);
} catch (error) { res.status(400).json({ error: error.message || 'Could not update job requisition' }); } };

async function requisitionAction(req, res, action) {
  try {
    if (['approve', 'reject', 'close'].includes(action) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only HR administrators can approve, reject, or close requisitions' });
    }
    if (action === 'submit' && !await canManageRequisition(req, req.params.id)) {
      return res.status(403).json({ error: 'Only the assigned department head can submit this requisition' });
    }
    const note = clean(req.body.note) || null;
    let query, params;
    if (action === 'submit') {
      query = "UPDATE job_requisitions SET approval_status='pending',approval_note=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 AND approval_status IN ('draft','rejected') RETURNING *";
      params = [note, req.params.id, req.user.company_id];
    } else if (action === 'approve') {
      query = "UPDATE job_requisitions SET approval_status='approved',approved_by_id=$1,approved_at=NOW(),approval_note=$2,updated_at=NOW() WHERE id=$3 AND company_id=$4 AND approval_status='pending' RETURNING *";
      params = [req.user.id, note, req.params.id, req.user.company_id];
    } else if (action === 'reject') {
      query = "UPDATE job_requisitions SET approval_status='rejected',approved_by_id=$1,approved_at=NOW(),approval_note=$2,updated_at=NOW() WHERE id=$3 AND company_id=$4 AND approval_status='pending' RETURNING *";
      params = [req.user.id, note, req.params.id, req.user.company_id];
    } else if (action === 'close') {
      query = "UPDATE job_requisitions SET status='closed',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status<>'closed' RETURNING *";
      params = [req.params.id, req.user.company_id];
    }
    const result = await db.query(query, params);
    if (!result.rows.length) return res.status(409).json({ error: 'This requisition cannot be moved to that status' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Could not update job requisition' }); }
}
exports.submitRequisition = (req, res) => requisitionAction(req, res, 'submit');
exports.approveRequisition = (req, res) => requisitionAction(req, res, 'approve');
exports.rejectRequisition = (req, res) => requisitionAction(req, res, 'reject');
exports.closeRequisition = (req, res) => requisitionAction(req, res, 'close');

exports.getPostings = async (req, res) => { try {
  const result = await db.query(`SELECT p.*,r.requisition_code,r.title AS requisition_title,r.approval_status,r.status AS requisition_status,
      d.name AS department_name,COUNT(a.id)::int AS applicant_count
    FROM job_postings p JOIN job_requisitions r ON r.id=p.requisition_id
    LEFT JOIN departments d ON d.id=r.department_id
    LEFT JOIN candidate_applications a ON a.requisition_id=r.id
    WHERE p.company_id=$1 GROUP BY p.id,r.id,d.name ORDER BY p.created_at DESC`, [req.user.company_id]);
  res.json(result.rows);
} catch (error) { res.status(500).json({ error: 'Could not load job postings' }); } };

exports.getPosting = async (req, res) => { try {
  const result = await db.query(`SELECT p.*,r.requisition_code,r.title AS requisition_title,r.approval_status,r.status AS requisition_status
    FROM job_postings p JOIN job_requisitions r ON r.id=p.requisition_id
    WHERE p.id=$1 AND p.company_id=$2`, [req.params.id, req.user.company_id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Job posting not found' });
  res.json(result.rows[0]);
} catch (error) { res.status(500).json({ error: 'Could not load job posting' }); } };

function postingData(body) {
  const requisitionId = integer(body.requisition_id);
  const channel = isOneOf(clean(body.channel), postingChannels);
  const status = isOneOf(clean(body.status), postingStatuses) || 'draft';
  const title = clean(body.title);
  if (!requisitionId || !channel || !title) throw new Error('Requisition, channel, and posting title are required');
  return { requisitionId, channel, status, title, summary: clean(body.summary) || null, closesAt: body.closes_at || null, externalUrl: clean(body.external_url) || null };
}

async function eligibleRequisition(companyId, requisitionId) {
  const result = await db.query("SELECT id FROM job_requisitions WHERE id=$1 AND company_id=$2 AND approval_status='approved' AND status<>'closed'", [requisitionId, companyId]);
  if (!result.rows.length) throw new Error('Choose an approved, active requisition');
}

exports.createPosting = async (req, res) => { try {
  const data = postingData(req.body);
  await eligibleRequisition(req.user.company_id, data.requisitionId);
  const result = await db.query(`INSERT INTO job_postings(company_id,requisition_id,channel,title,summary,status,published_at,closes_at,external_url,created_by_id)
    VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='published' THEN NOW() ELSE NULL END,$7,$8,$9) RETURNING *`,
    [req.user.company_id, data.requisitionId, data.channel, data.title, data.summary, data.status, data.closesAt, data.externalUrl, req.user.id]
  );
  await syncRequisitionPublicationStatus(req.user.company_id, data.requisitionId);
  res.status(201).json(result.rows[0]);
} catch (error) {
  if (error.code === '23505') return res.status(409).json({ error: 'This channel already has a posting for the requisition' });
  res.status(400).json({ error: error.message || 'Could not create job posting' });
} };

exports.updatePosting = async (req, res) => { try {
  const data = postingData(req.body);
  const existing = await db.query('SELECT requisition_id FROM job_postings WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Job posting not found' });
  if (Number(existing.rows[0].requisition_id) !== data.requisitionId) await eligibleRequisition(req.user.company_id, data.requisitionId);
  const result = await db.query(`UPDATE job_postings SET requisition_id=$1,channel=$2,title=$3,summary=$4,status=$5,
      published_at=CASE WHEN $5='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,
      closes_at=$6,external_url=$7,updated_at=NOW() WHERE id=$8 AND company_id=$9 RETURNING *`,
    [data.requisitionId, data.channel, data.title, data.summary, data.status, data.closesAt, data.externalUrl, req.params.id, req.user.company_id]
  );
  await syncRequisitionPublicationStatus(req.user.company_id, existing.rows[0].requisition_id);
  if (Number(existing.rows[0].requisition_id) !== data.requisitionId) await syncRequisitionPublicationStatus(req.user.company_id, data.requisitionId);
  res.json(result.rows[0]);
} catch (error) {
  if (error.code === '23505') return res.status(409).json({ error: 'This channel already has a posting for the requisition' });
  res.status(400).json({ error: error.message || 'Could not update job posting' });
} };

exports.getPipeline = async (req, res) => { try {
  const requisitionId = integer(req.query.requisition_id);
  await ensurePipelineStages(req.user.company_id);
  const params = requisitionId ? [req.user.company_id, requisitionId] : [req.user.company_id];
  const filter = requisitionId ? 'AND a.requisition_id=$2' : '';
  const [stages, applications] = await Promise.all([
    db.query('SELECT stage_key,name,sort_order FROM recruitment_stages WHERE company_id=$1 ORDER BY sort_order,name', [req.user.company_id]),
    db.query(`SELECT a.id,a.full_name,a.email,a.status,a.rating,a.submitted_at,a.requisition_id,r.title AS requisition_title
      FROM candidate_applications a LEFT JOIN job_requisitions r ON r.id=a.requisition_id
      WHERE a.company_id=$1 ${filter} ORDER BY a.submitted_at DESC`, params)
  ]);
  res.json({ stages: stages.rows, applications: applications.rows });
} catch (error) { res.status(500).json({ error: 'Could not load recruitment pipeline' }); } };

exports.getInterviews = async (req, res) => { try {
  const result = await db.query(`SELECT i.*,a.full_name AS candidate_name,a.status AS candidate_status,a.requisition_id,
      r.title AS requisition_title,CONCAT(e.first_name,' ',e.last_name) AS interviewer_name
    FROM candidate_interviews i JOIN candidate_applications a ON a.id=i.application_id
    LEFT JOIN job_requisitions r ON r.id=a.requisition_id LEFT JOIN employees e ON e.id=i.interviewer_id
    WHERE a.company_id=$1 ORDER BY CASE WHEN i.status='scheduled' THEN 0 ELSE 1 END,i.scheduled_at ASC`, [req.user.company_id]);
  res.json(result.rows);
} catch (error) { res.status(500).json({ error: 'Could not load interviews' }); } };

exports.getOffers = async (req, res) => { try {
  const result = await db.query(`SELECT o.*,a.full_name AS candidate_name,a.email,a.status AS candidate_status,a.requisition_id,
      r.title AS requisition_title FROM candidate_offers o JOIN candidate_applications a ON a.id=o.application_id
      LEFT JOIN job_requisitions r ON r.id=a.requisition_id WHERE a.company_id=$1
      ORDER BY CASE WHEN o.status IN ('draft','sent') THEN 0 ELSE 1 END,o.updated_at DESC`, [req.user.company_id]);
  res.json(result.rows);
} catch (error) { res.status(500).json({ error: 'Could not load job offers' }); } };
