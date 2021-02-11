var express = require('express');
var router = express.Router();
var pool = require('../config/db'); // mysql pool of connections
var bcrypt = require('bcrypt');
var prefix_url = '/website';
var fs = require('fs');
var csv = require('fast-csv');
var moment = require('moment');
var helper = require('./helper');
var csurf = require('csurf');
var cors = require('cors')

const csrfMiddleware = csurf({
  cookie: true
});

router.use(csrfMiddleware);

// check if the admin is logged in
router.use(function (req, res, next) {
  var url = req.url;
  var admin_id = req.session.admin_id;
  var admin_role = req.session.admin_role;
  if (url != '/' && url != '/login' && !admin_id) {
    res.redirect(prefix_url + '/login');
    return;
  }
  res.locals.admin_id = admin_id;
  res.locals.admin_role = admin_role;
  if (url == '/login' && admin_id) {
    res.redirect(prefix_url + '/dashboard');
    return;
  }
  next();
});

// send CSRF tokens with responses
router.use(function (req, res, next) {
  if (req.method == 'GET') {
    res.locals.csrfToken = req.csrfToken();
  }
  next();
});

router.get('/', function (req, res, next) {
  res.redirect(prefix_url + '/login');
});

router.get('/login', function (req, res, next) {
  res.render('login', { title: 'Login' });
});

// Login
router.post('/login', async function (req, res, next) {
  try {
    var username = req.body.username;
    var password = req.body.password;

    var admin = await pool.query("SELECT * FROM admin WHERE username = ?", username);
    if (admin.length == 0) {
      res.render('login', {
        title: 'Login',
        error: 'User not found'
      });
      return;
    }
    admin = admin[0];
    if (admin.is_deleted) {
      res.render('login', {
        title: 'Login',
        error: 'This admin is deleted'
      });
      return;
    }
    if (!admin.enabled) {
      res.render('login', {
        title: 'Login',
        error: 'This admin is disabled'
      });
      return;
    }
    if (!bcrypt.compareSync(password, admin.password)) {
      res.render('login', {
        title: 'Login',
        error: 'Incorrect password ' + "adminPW: " +  admin.password + 'PASSWORD: ' + password
      });
      return;
    }

    // window.localStorage.setItem("username", username);
    // window.localStorage.setItem("password", password);
    // credentials url
    var credentials = {
      "jid": username + "@54.82.188.133",
      "password": password,
    }

    var credentials_json = JSON.stringify(credentials);

    fs.writeFile('./public/data/credentials/' + username + '.json',credentials_json,function(err){
          if(err){
              console.error(err);
        }
    })
    req.session.admin_id = admin.id;
    req.session.admin_role = admin.role;
    res.redirect(prefix_url + '/dashboard');
  }
  catch (error) {
    res.render('login', {
      title: 'Login',
      error: 'Incorrect password'
    });
  }
});

// Logout
router.post('/logout', function (req, res, next) {
  delete req.session.admin_id;
  delete req.session.admin_role;
  // window.localStorage.removeItem('username');
  // window.localStorage.removeItem('password');
  res.end(JSON.stringify({ success: true }));
});


router.get('/dashboard', async function (req, res, next) {
  res.render('dashboard', { title: 'Home' });
});

// Report export
router.post('/report/inactive_patients/count', async function (req, res, next) {
  var patients = await pool.query(`
    SELECT a.id, a.name, a.detail_info
    FROM patient a
    WHERE a.is_deleted = 0
  `);
  count = 0;
  for (var i = 0; i < patients.length; ++i) {
    var last_attempt = await pool.query(`
      SELECT a.*, DATEDIFF(NOW(), a.created_at) 'days_diff'
      FROM attempt a 
      JOIN _event b ON a.event_id = b.id
      JOIN activity c ON b.activity_id = c.id
      WHERE c.patient_id = ? AND c.is_deleted = 0
      ORDER BY id DESC
      LIMIT 1
    `, patients[i].id);
    if (last_attempt.length == 0 || last_attempt[0].days_diff >= 7) {
      ++count;
    }
  }
  res.status(200).json({ success: true, inactive_patients_count: count });
});

router.get('/report/patient_inactivity', async function (req, res, next) {
  var patients = await pool.query(`
    SELECT a.id, a.name, a.detail_info
    FROM patient a
    WHERE a.is_deleted = 0
  `);
  count = 0;
  for (var i = 0; i < patients.length; ++i) {
    var last_attempt = await pool.query(`
      SELECT a.*, DATEDIFF(NOW(), a.created_at) 'days_diff'
      FROM attempt a 
      JOIN _event b ON a.event_id = b.id
      JOIN activity c ON b.activity_id = c.id
      WHERE c.patient_id = ? AND c.is_deleted = 0
      ORDER BY id DESC
      LIMIT 1
    `, patients[i].id);
    if (last_attempt.length) {
      patients[i].last_attempt = last_attempt[0];
    }
  }
  res.render('dashboard', {
    title: 'Dashboard',
    patients: patients
  });
});

// Activity (Prescription)
router.get('/activities', async function (req, res, next) {
  try {

    var deleted = req.query.deleted;

    var patient_id = req.query.patient_id ? req.query.patient_id : 'all';
    var type = req.query.type ? req.query.type : 'all';
    var workout_type = req.query.workout_type ? req.query.workout_type : 'all';
    var location_type = req.query.location_type ? req.query.location_type : 'all';
    var start_date = req.query.start_date ? req.query.start_date : '';
    var created_at = req.query.created_at ? req.query.created_at : '';

    var conditions = ` WHERE 1 AND a.is_deleted = ? `;

    var parameters = [];

    if (deleted) {
      parameters.push(deleted);
    } else {
      parameters.push(0)
    }
    if (patient_id != 'all') {
      conditions += ` AND a.patient_id = ? `;
      parameters.push(patient_id);
    }
    if (type != 'all') {
      conditions += ` AND a.type = ? `;
      parameters.push(type);
    }
    if (workout_type != 'all') {
      conditions += ` AND a.workout_type = ? `;
      parameters.push(workout_type);
    }
    if (location_type != 'all') {
      conditions += ` AND a.location_type = ? `;
      parameters.push(location_type);
    }
    if (start_date != '') {
      conditions += ` AND a.start_date = ? `;
      parameters.push(start_date);
    }
    if (created_at != '') {
      conditions += ` AND DATE(a.created_at) = ? `;
      parameters.push(created_at);
    }
    var results = await pool.query(`SELECT 
    a.*,
    b.name 'patient_name', 
    c.end_date 'schedule_end_date', c.type 'schedule_type', c.frequency 'schedule_frequency', c.skips 'schedule_skips',
    d.name 'workout_type_name', d.category 'workout_type_category', d.apple_id 'workout_type_apple_id'
    FROM activity a
    JOIN patient b ON a.patient_id = b.id
    JOIN _schedule c ON a.schedule_id = c.id 
    LEFT JOIN workout_type d ON a.workout_type = d.id` + conditions + ` ORDER BY a.id,a.patient_id,a.start_date,a.created_at`, parameters);
    var patients_results = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    var workout_types_results = await pool.query("SELECT * FROM workout_type ORDER BY category_id,apple_id");
    for (var i = 0; i < results.length; ++i) {
      results[i].schedule = {
        end_date: results[i].schedule_end_date,
        type: results[i].schedule_type,
        frequency: results[i].schedule_frequency,
        skips: results[i].schedule_skips,
      }
      delete results[i].schedule_end_date;
      delete results[i].schedule_type;
      delete results[i].schedule_frequency;
      delete results[i].schedule_skips;
    }
    res.render('activities', {
      title: 'Activities',
      activities: results,
      patients: patients_results,
      workout_types: workout_types_results,
      patient_id: patient_id,
      type: type,
      workout_type: workout_type,
      location_type: location_type,
      start_date: start_date,
      created_at: created_at,
      deleted: deleted
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/activities',
      button: true
    });
  }
});

router.get('/activities/form', async function (req, res, next) {
  try {
    var activity_id = req.query.activity_id ? req.query.activity_id : -1;
    var patients_results = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    var schedule_results = await pool.query("SELECT * FROM _schedule WHERE is_deleted = 0");
    var activity_results = await pool.query("SELECT * FROM activity WHERE id = ?", [activity_id]);
    if (activity_id != -1 && activity_results.length == 0) {
      res.render('form_failure', {
        message: "This activity does not exist",
        redirect: prefix_url + '/activities',
        button: true
      });
      return;
    }
    if (activity_results.length && activity_results[0].is_deleted) {
      res.render('form_failure', {
        message: "This activity is deleted",
        redirect: prefix_url + '/activities',
        button: true
      });
      return;
    }
    var workout_types_results = await pool.query("SELECT * FROM workout_type ORDER BY category_id,apple_id");
    res.render('activities_form', {
      title: activity_id != -1 ? 'Edit Activity' : 'Add Activity',
      patients: patients_results,
      schedules: schedule_results,
      workout_types: workout_types_results,
      activity: activity_results.length ? activity_results[0] : null
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/activities/form',
      button: true
    });
  }
});

router.post('/activities/form', async function (req, res, next) {
  try {
    var activity_id = req.body.activity_id;
    var patient_id = req.body.patient_id;
    var group_id = req.body.group_id;
    var type = req.body.type;
    var sub_type = req.body.sub_type;
    var workout_type = req.body.workout_type;
    var location_type = req.body.location_type;
    var title = req.body.title;
    var text = req.body.text;
    var instructions = req.body.instructions;
    var image_url = req.body.image_url;
    var color = req.body.color;
    var result_resettable = req.body.result_resettable;
    var schedule_id = req.body.schedule_id;
    var optional = req.body.optional;
    var target_heart_rate = req.body.target_heart_rate;
    var target_steps = req.body.target_steps;
    var target_distance = req.body.target_distance;
    var target_time = req.body.target_time * 60;
    var target_active_burned_energy = req.body.target_active_burned_energy;
    var summary = req.body.summary;
    var start_date = req.body.start_date;
    var end_date = req.body.end_date;

    if (activity_id == -1) {
      await pool.query(`INSERT INTO activity (patient_id,group_id,type,subtype,workout_type,location_type,title,text,instructions,image_url,
      color,result_resettable,schedule_id,optional,target_heart_rate,target_steps,target_distance,target_time,target_active_burned_energy
      ,summary,start_date,end_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        patient_id, group_id, type, sub_type, workout_type, location_type, title, text, instructions, image_url, color, result_resettable,
        schedule_id, optional, target_heart_rate, target_steps, target_distance, target_time, target_active_burned_energy, summary, start_date, end_date
      ]);
      res.render('form_success', {
        message: 'New record added',
        redirect: '/website/activities'
      });
    }
    else {
      await pool.query(`UPDATE activity SET 
        patient_id = ?,group_id = ?,type = ?,subtype = ?, workout_type = ?,location_type = ?,title = ?,text = ?,instructions = ?,image_url = ?,
        color = ?,result_resettable = ?,schedule_id = ?,optional = ?,target_heart_rate = ?,target_steps = ?,
        target_distance = ?,target_time = ?, target_active_burned_energy = ?,summary = ?,start_date = ? , end_date = ?
        WHERE id = ?`, [
        patient_id, group_id, type, sub_type, workout_type, location_type, title, text, instructions, image_url, color, result_resettable,
        schedule_id, optional, target_heart_rate, target_steps, target_distance, target_time, target_active_burned_energy, summary, start_date, end_date, activity_id
      ]);
      res.render('form_success', {
        message: 'Activity Updated',
        redirect: '/website/activities'
      });
    }
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/activities/form',
      button: true
    });
  }
});

router.post('/activities/delete', async function (req, res, next) {
  try {
    var activity_id = req.body.activity_id;
    var result = await pool.query("UPDATE activity set is_deleted = 1 WHERE id = ?", activity_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

router.post('/activities/recover', async function (req, res, next) {
  try {
    var activity_id = req.body.activity_id;
    var result = await pool.query("UPDATE activity set is_deleted = 0 WHERE id = ?", activity_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

// Admin
router.get('/admins', async function (req, res, next) {
  try {
    var email_verified = req.query.email_verified ? req.query.email_verified : 'all';
    var role = req.query.role ? req.query.role : 'all';
    var conditions = ` WHERE 1 AND a.is_deleted = 0 `;
    var parameters = [];
    if (email_verified != 'all') {
      conditions += ` AND a.email_verified = ? `;
      parameters.push(email_verified);
    }
    if (role != 'all') {
      conditions += ` AND a.role = ? `;
      parameters.push(role);
    }
    var results = await pool.query(`SELECT a.id, a.username, a.name, a.email, a.email_verified, a.created_at, b.name 'role_name', a.enabled
      FROM admin a LEFT JOIN admin_role b ON a.role = b.id ` + conditions + ` ORDER BY a.id`, parameters);
    var roles = await pool.query("SELECT * FROM admin_role");
    var logged_admin = await pool.query("SELECT * FROM admin WHERE id = ?", req.session.admin_id);
    res.render('admins', {
      title: 'Admins',
      logged_admin: logged_admin[0],
      admins: results,
      roles: roles,
      role: role,
      email_verified: email_verified
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/admins',
      button: true
    });
  }
});

router.get('/admins/form', async function (req, res, next) {
  try {
    var admin_id = req.query.admin_id ? req.query.admin_id : -1;
    var admin = await pool.query(`SELECT a.id, a.username, a.name, a.email, a.email_verified, a.role, a.created_at, b.name 'role_name', a.is_deleted, a.enabled
      FROM admin a LEFT JOIN admin_role b ON a.role = b.id WHERE a.id = ?`, admin_id);
    var logged_admin = await pool.query("SELECT * FROM admin WHERE id = ?", req.session.admin_id);
    if (admin_id != -1 && admin.length == 0) {
      res.render('form_failure', {
        message: "This admin does not exist",
        redirect: prefix_url + '/admins',
        button: true
      });
    }
    if (admin_id != -1 && logged_admin[0].role != 1 && logged_admin[0].id != admin_id) {
      res.render('form_failure', {
        message: "You are not allowed to modify this admin",
        redirect: prefix_url + '/admins',
        button: true
      });
    }
    if (admin.length && admin[0].is_deleted) {
      res.render('form_failure', {
        message: "This admin is deleted",
        redirect: prefix_url + '/admins',
        button: true
      });
    }
    var roles = await pool.query("SELECT * FROM admin_role");
    res.render('admins_form', {
      title: admin_id != -1 ? 'Edit Admin' : 'Add Admin',
      roles: roles,
      logged_admin: logged_admin[0],
      admin: admin.length ? admin[0] : null
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/admins/form',
      button: true
    });
  }
});

router.post('/admins/form', async function (req, res, next) {
  try {
    var admin_id = req.body.admin_id;
    var username = req.body.username;
    var email = req.body.email;
    var name = req.body.name;
    var role = req.body.role;
    var disable = req.body.disable ? req.body.disable : '1';
    var password = req.body.password;
    var parameters = [username, email, name, role];
    if (admin_id == -1) {
      password = bcrypt.hashSync(password, 10);
      parameters.push(password);
      await pool.query(`INSERT INTO admin (username, email, name, role` + (password ? `, password` : ``) + `) VALUES (?,?,?,?` + (password ? `,?` : ``) + `)`, parameters);
      res.render('form_success', {
        message: 'New admin registered successfully',
        redirect: prefix_url + '/admins'
      });
    }
    else {
      parameters = [email, name];
      if (role) {
        parameters.push(role);
      }
      if (disable) {
        parameters.push(disable);
      }
      if (password) {
        password = bcrypt.hashSync(password, 10);
        parameters.push(password);
      }
      parameters.push(admin_id);
      await pool.query(`UPDATE admin SET email = ?, name = ?` + (role ? `, role = ?` : ``) + (disable ? `, enabled = ?` : ``) + (password ? `, password = ?` : ``) + ` WHERE id = ?`, parameters);
      var admin = await pool.query("SELECT username FROM admin WHERE id = ?", admin_id);
      res.render('form_success', {
        message: 'Admin Updated Successfully',
        redirect: prefix_url + '/admins'
      });
    }
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/admins/form',
      button: true
    });
  }
});

router.post('/admins/delete', async function (req, res, next) {
  try {
    var admin_id = req.body.admin_id;
    var result = await pool.query("UPDATE admin set is_deleted = 1 WHERE id = ?", admin_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

//Patient
router.get('/patients', async function (req, res, next) {
  try {
    var deleted = req.query.deleted;
    //console.log(deleted)
    var conditions = ` WHERE is_deleted = ?`  ;

    var parameters = [];

    if (deleted) {
      parameters.push(deleted);
    } else {
      parameters.push(0)
    }

    var results = await pool.query("SELECT * FROM patient " + conditions, parameters);
    var contact_results = await pool.query("SELECT a.*, b.english 'contact_type' FROM contact a JOIN contact_type b ON a.type = b.id");

    var contact_map = [];
    for (var i = 0; i < contact_results.length; ++i) {
      contact_results[i].type = contact_results[i].contact_type;
      delete contact_results[i].contact_type;
      contact_map[contact_results[i].id] = contact_results[i];
    }

    var contact_info_results = await pool.query("SELECT * FROM contact_info");

    var contact_info_map = {};
    for (var i = 0; i < contact_info_results.length; ++i) {
      contact_info_map[contact_info_results[i].id] = contact_info_results[i];
    }

    for (var k = 0; k < results.length; ++k) {

      delete results[k].password;
      delete results[k].token;

      // adjust care team contacts
      results[k].care_team_contact_id += '';
      results[k].care_team_contacts = results[k].care_team_contact_id ? results[k].care_team_contact_id.split(",") : [];
      delete results[k].care_team_contact_id;

      // adjust contact_info for the care team contacts
      for (var i = 0; i < results[k].care_team_contacts.length; ++i) {
        var id = results[k].care_team_contacts[i];
        var contact = contact_map[id];

        results[k].care_team_contacts[i] = JSON.parse(JSON.stringify(contact)); // assign copy of the object not the object itself
        results[k].care_team_contacts[i].contact_items += '';
        results[k].care_team_contacts[i].contact_items = results[k].care_team_contacts[i].contact_items ? results[k].care_team_contacts[i].contact_items.split(",") : [];

        for (var j = 0; j < results[k].care_team_contacts[i].contact_items.length; ++j) {
          var item_id = results[k].care_team_contacts[i].contact_items[j];
          var contact_info = contact_info_map[item_id];
          results[k].care_team_contacts[i].contact_items[j] = JSON.parse(JSON.stringify(contact_info));
        }
      }
    }
    var all_patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    res.render('patients', {
      title: 'Patients',
      patients: results,
      all_patients: all_patients,
      // email_verified: email_verified,
      // patient_id: patient_id
      deleted: deleted
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/patients',
      button: true
    });
  }
});

router.get('/patients/form', async function (req, res, next) {
  try {
    var patient_id = req.query.patient_id ? req.query.patient_id : -1;
    var results = await pool.query("SELECT * FROM contact WHERE is_deleted = 0");
    var patient_results = await pool.query("SELECT * FROM patient WHERE id = ?", patient_id);
    if (patient_id != -1 && patient_results.length == 0) {
      res.render('form_failure', {
        message: "This patient does not exist",
        redirect: prefix_url + '/patients',
        button: true
      });
    }
    if (patient_results.length && patient_results[0].is_deleted) {
      res.render('form_failure', {
        message: "This patient is deleted",
        redirect: prefix_url + '/patients',
        button: true
      });
    }
    res.render('patients_form', {
      title: patient_id != -1 ? 'Edit Patient' : 'Add Patient',
      contacts: results,
      patient: patient_results.length ? patient_results[0] : null
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/patients/form',
      button: true
    });
  }
});

router.post('/patients/form', async function (req, res, next) {
  try {
    var patient_id = req.body.patient_id;
    var name = req.body.name;
    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;
    var detail_info = req.body.detail_info;
    var color = req.body.color;
    var monogram = req.body.monogram;
    var custom_score_value = req.body.custom_score_value * 60;
    var image_url = req.body.image_url;
    var categories = req.body.categories;
    var care_team = Array.isArray(req.body.care_team) ? req.body.care_team.join(",") : req.body.care_team;
    var parameters = [name, username, email, detail_info, color, monogram, custom_score_value, image_url, categories, care_team];
    if (password) {
      password = bcrypt.hashSync(password, 10);
      parameters.push(password);
    }
    if (patient_id == -1) {
      await pool.query(`INSERT INTO patient (name,username,email,detail_info,color,monogram,custom_score_value,image_url,categories,care_team_contact_id` + (password ? ',password' : '') + `) VALUES (?,?,?,?,?,?,?,?,?,?` + (password ? ',?' : '') + `)`, parameters);
      res.render('form_success', {
        message: 'New patient added',
        redirect: '/website/patients'
      });
    } else {
      parameters = [name, username, email, detail_info, color, monogram, custom_score_value, image_url, categories, care_team, patient_id];
      if (password) {
        parameters.splice(10,0,password);
      }
      //console.log(parameters)
      await pool.query(`UPDATE patient SET name = ?,username = ?,email = ?,detail_info = ?,color = ?, monogram = ?,custom_score_value = ?,image_url = ?, categories = ?,care_team_contact_id = ? ` + (password ? ',password = ?' : '') + ` WHERE id = ?`, parameters);
      res.render('form_success', {
        message: 'Patient updated',
        redirect: '/website/patients'
      });
    }
  } catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/patients/form',
      button: true
    });
  }
});

router.post('/patients/delete', async function (req, res, next) {
  try {
    var patient_id = req.body.patient_id;
    var result = await pool.query("UPDATE patient set is_deleted = 1 WHERE id = ?", patient_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

router.post('/patients/recover', async function (req, res, next) {
  try {
    var patient_id = req.body.patient_id;
    var result = await pool.query("UPDATE patient set is_deleted = 0 WHERE id = ?", patient_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

router.get('/charts/patient', async function (req, res, next) {
  try {
    var patient_id = req.query.patient_id ? req.query.patient_id : -1;
    if (patient_id == -1) {
      res.render('form_failure', {
        message: "You have to provide patient ID",
        redirect: prefix_url + '/patients',
        button: true
      });
    }
    var activity_id = req.query.activity_id ? req.query.activity_id : 'all';
    var event_id = req.query.event_id ? req.query.event_id : 'all';
    var attempts = req.query.attempts ? req.query.attempts : [];
    var patient = await pool.query("SELECT name, is_deleted FROM patient WHERE id = ?", patient_id);
    if (patient.length == 0) {
      res.render('form_failure', {
        message: "This patient does not exist",
        redirect: prefix_url + '/patients',
        button: true
      });
    }
    if (patient[0].is_deleted) {
      res.render('form_failure', {
        message: "This patient is deleted",
        redirect: prefix_url + '/patients',
        button: true
      });
    }
    var conditions = " WHERE 1 AND d.id = ? AND c.is_deleted = 0 AND d.is_deleted = 0 ";
    var parameters = [patient_id];
    if (activity_id != 'all') {
      conditions += " AND c.id = ? ";
      parameters.push(activity_id);
    }
    if (event_id != 'all') {
      conditions += " AND b.id = ? ";
      parameters.push(event_id);
    }
    if (attempts.length) {
      conditions += " AND a.id IN (?) ";
      parameters.push(attempts);
    }
    else {
      conditions += "ORDER BY a.created_at DESC LIMIT 5";
      var reverse_flag = 1;
    }
    var chart_attempts = await pool.query(`
    SELECT a.*
    FROM attempt a
    JOIN _event b ON a.event_id = b.id 
    JOIN activity c ON b.activity_id = c.id
    JOIN patient d ON c.patient_id = d.id
    ` + conditions, parameters);
    if (reverse_flag) {
      chart_attempts = chart_attempts.reverse();
    }
    var max_heart_rate_count = 0;
    for (var i = 0; i < chart_attempts.length; ++i) {
      var heart_rates = await pool.query("SELECT * FROM heart_rate WHERE attempt_id = ?", chart_attempts[i].id);
      chart_attempts[i].heart_rates_array = [];
      for (var j = 0; j < heart_rates.length; ++j) {
        chart_attempts[i].heart_rates_array.push(heart_rates[j].value);
      }
      max_heart_rate_count = Math.max(max_heart_rate_count, chart_attempts[i].heart_rates_array.length);
    }
    if (!attempts.length) {
      for (var i = 0; i < chart_attempts.length; ++i) {
        attempts.push(chart_attempts[i].id + '');
      }
    }
    var all_patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    var all_activities = await pool.query("SELECT * FROM activity WHERE is_deleted = 0");
    var all_events = await pool.query(`
    SELECT a.*, b.patient_id, b.id 'activity_id' 
    FROM _event a 
    JOIN activity b ON a.activity_id = b.id 
    WHERE b.is_deleted = 0`);
    var all_attempts = await pool.query(`
    SELECT a.*, c.patient_id, c.id 'activity_id', b.id 'event_id' 
    FROM attempt a
    JOIN _event b ON a.event_id = b.id 
    JOIN activity c ON b.activity_id = c.id
    WHERE c.is_deleted = 0`);
    res.render('charts', {
      title: 'Patient Charts',
      patient_id: patient_id,
      activity_id: activity_id,
      event_id: event_id,
      attempts: attempts,
      patient: patient[0],
      all_patients: all_patients,
      all_events: all_events,
      all_activities: all_activities,
      all_attempts: all_attempts,
      chart_attempts: chart_attempts,
      max_heart_rate_count: max_heart_rate_count
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/patients',
      button: true
    });
  }
});

// Care Team Contact 
router.get('/contacts', async function (req, res, next) {
  try {
    var type = req.query.type ? req.query.type : 'all';
    var conditions = ` WHERE 1 AND is_deleted = 0 `;
    var parameters = [];
    if (type != 'all') {
      conditions += ` AND type = ? `;
      parameters.push(type);
    }
    var results = await pool.query(`SELECT a.*, b.english 'contact_type' FROM contact a JOIN contact_type b ON a.type = b.id `
      + conditions, parameters);
    var contact_items_results = await pool.query("SELECT * FROM contact_info");
    var contact_types_results = pool.query("SELECT * FROM contact_type");

    var contact_info_map = [];
    for (var i = 0; i < contact_items_results.length; ++i) {
      contact_info_map[contact_items_results[i].id] = contact_items_results[i];
    }

    for (var i = 0; i < results.length; ++i) {
      results[i].contact_items += '';
      results[i].contact_items = results[i].contact_items ? results[i].contact_items.split(",") : [];
      for (var j = 0; j < results[i].contact_items.length; ++j) {
        var id = results[i].contact_items[j];
        results[i].contact_items[j] = JSON.parse(JSON.stringify(contact_info_map[id]));
      }
    }

    res.render('contacts', {
      title: 'Contacts',
      contacts: results,
      type: type,
      contact_types: contact_types_results,
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/contacts',
      button: true
    });
  }
});

router.get('/contacts/form', async function (req, res, next) {
  try {
    var contact_id = req.query.contact_id ? req.query.contact_id : -1;
    var contact_results = await pool.query("SELECT * FROM contact WHERE id = ?", [contact_id]);
    if (contact_id != -1 && contact_results.length == 0) {
      res.render('form_failure', {
        message: "This record does not exist",
        redirect: prefix_url + '/contacts',
        button: true
      });
    }
    if (contact_results.length && contact_results[0].is_deleted) {
      res.render('form_failure', {
        message: "This record is deleted",
        redirect: prefix_url + '/contacts',
        button: true
      });
    }
    var contact_types_results = await pool.query("SELECT * FROM contact_type");
    var contact_items_results = await pool.query("SELECT * FROM contact_info WHERE is_deleted = 0");
    res.render('contacts_form', {
      title: contact_id != -1 ? 'Edit Contact' : 'Add Contact',
      contact: contact_results.length ? contact_results[0] : null,
      contact_types: contact_types_results,
      contact_items: contact_items_results
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/contacts/form',
      button: true
    });
  }
});

router.post('/contacts/form', async function (req, res, next) {
  try {
    var contact_id = req.body.contact_id;
    var type = req.body.type;
    var name = req.body.name;
    var relation = req.body.relation;
    var contact_items = Array.isArray(req.body.contact_items) ? req.body.contact_items.join(",") : req.body.contact_items;
    var color = req.body.color;
    var image_url = req.body.image_url;
    if (contact_id == -1) {
      await pool.query(`INSERT INTO contact (type,name,relation,contact_items,color,image_url) VALUES (?,?,?,?,?,?)`, [type, name, relation, contact_items, color, image_url]);
      res.render('form_success', {
        message: 'New record added',
        redirect: '/website/contacts'
      });
    }
    else {
      await pool.query(`UPDATE contact SET 
        type = ?,name = ?,relation = ?,contact_items = ?,color = ?,image_url = ?
        WHERE id = ?`, [type, name, relation, contact_items, color, image_url, contact_id]);
      res.render('form_success', {
        message: 'Contact updated',
        redirect: '/website/contacts'
      });
    }
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/contacts/form',
      button: true
    });
  }
});

router.post('/contacts/delete', async function (req, res, next) {
  try {
    console.log('here');
    var contact_id = req.body.contact_id;
    var patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    var patients_list = [];
    for (var i = 0; i < patients.length; ++i) {
      console.log(patients[i].id);
      contacts = patients[i].care_team_contact_id.split(",");
      console.log(contacts);
      if (contacts.indexOf(contact_id + '') != -1) {
        patients_list.push(patients[i].name);
      }
    }
    if (patients_list.length) {
      console.log(patients_list);
      res.status(500).json({
        success: false,
        error: "This record is attached to the following patients: (" + patients_list.join(", ") +
          "). Please release them first"
      });
      return;
    }
    var result = await pool.query("UPDATE contact set is_deleted = 1 WHERE id = ?", contact_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

//Care Team Contact Item
router.get('/contacts_info', async function (req, res, next) {
  try {
    var type = req.query.type ? req.query.type : 'all';
    var conditions = ` WHERE 1 AND is_deleted = 0 `;
    var parameters = [];
    if (type != 'all') {
      conditions += ` AND type = ? `;
      parameters.push(type);
    }
    var results = await pool.query(`SELECT * FROM contact_info ` + conditions, parameters);
    res.render('contacts_info', {
      title: 'Contacts Info',
      contacts_info: results,
      type: type
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/contacts_info',
      button: true
    });
  }
});

router.get('/contacts_info/form', async function (req, res, next) {
  try {
    var contacts_info_id = req.query.contacts_info_id ? req.query.contacts_info_id : -1;
    var contacts_info_results = await pool.query("SELECT * FROM contact_info WHERE id = ?", contacts_info_id);
    if (contacts_info_id != -1 && contacts_info_results.length == 0) {
      res.render('form_failure', {
        message: "This item does not exist",
        redirect: prefix_url + '/contacts_info',
        button: true
      });
      return;
    }
    if (contacts_info_results.length && contacts_info_results[0].is_deleted) {
      res.render('form_failure', {
        message: "This item is deleted",
        redirect: prefix_url + '/contacts_info',
        button: true
      });
      return;
    }
    res.render('contacts_info_form', {
      title: contacts_info_id != -1 ? 'Edit Contact Item' : 'Add Contact Item',
      contacts_info: contacts_info_results.length ? contacts_info_results[0] : null
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/contacts_info/form',
      button: true
    });
  }
});

router.post('/contacts_info/form', async function (req, res, next) {
  try {
    var contacts_info_id = req.body.contacts_info_id;
    var type = req.body.type;
    var value = req.body.value;
    if (contacts_info_id == -1) {
      await pool.query(`INSERT INTO contact_info (type,value) VALUES (?,?)`, [type, value]);
      res.render('form_success', {
        message: 'New record added',
        redirect: '/website/contacts_info'
      });
    }
    else {
      await pool.query(`UPDATE contact_info SET type = ?,value = ? WHERE id = ?`, [type, value, contacts_info_id]);
      res.render('form_success', {
        message: 'Updated',
        redirect: '/website/contacts_info'
      });
    }
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/contacts_info/form',
      button: true
    });
  }
});

router.post('/contacts_info/delete', async function (req, res, next) {
  try {
    var contacts_info_id = req.body.contacts_info_id;
    var contacts = await pool.query("SELECT * FROM contact WHERE is_deleted = 0");
    console.log(contacts);
    var contacts_list = [];
    for (var i = 0; i < contacts.length; ++i) {
      cur_contacts = contacts[i].contact_items.split(",");
      if (cur_contacts.indexOf(contacts_info_id + '') != -1) {
        contacts_list.push(contacts[i].id);
      }
    }
    console.log(contacts_list);
    if (contacts_list.length) {
      res.status(500).json({
        success: false,
        error: "This record is attached to contacts with the following care team contacts IDs: (" + contacts_list.join(", ") +
          "). Please release them first"
      });
      return;
    }
    var result = await pool.query("UPDATE contact_info set is_deleted = 1 WHERE id = ?", contacts_info_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

// Schedule
router.get('/schedules', async function (req, res, next) {
  try {
    var end_date = req.query.end_date ? req.query.end_date : '';
    var type = req.query.type ? req.query.type : 'all';
    var skips = req.query.skips ? req.query.skips : '';
    var conditions = ` WHERE 1 AND is_deleted = 0 `;
    var parameters = [];
    if (end_date != '') {
      conditions += ` AND end_date = ? `;
      parameters.push(end_date);
    }
    if (type != 'all') {
      conditions += ` AND type = ? `;
      parameters.push(type);
    }
    if (skips != '') {
      conditions += ` AND skips = ? `;
      parameters.push(skips);
    }
    var results = await pool.query(`SELECT * FROM _schedule ` + conditions, parameters);
    res.render('schedules', {
      title: 'Schedules',
      schedules: results,
      end_date: end_date,
      type: type,
      skips: skips
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/schedules',
      button: true
    });
  }
});

router.get('/schedules/form', async function (req, res, next) {
  try {
    var schedule_id = req.query.schedule_id ? req.query.schedule_id : -1;
    var schedule_results = await pool.query("SELECT * FROM _schedule WHERE id = ?", schedule_id);
    if (schedule_id != -1 && schedule_results.length == 0) {
      res.render('form_failure', {
        message: "This record does not exist",
        redirect: prefix_url + '/schedules',
        button: true
      });
    }
    if (schedule_results.length && schedule_results[0].is_deleted) {
      res.render('form_failure', {
        message: "This record is deleted",
        redirect: prefix_url + '/schedules',
        button: true
      });
    }
    res.render('schedules_form', {
      title: schedule_id != -1 ? 'Edit Schedule' : 'Add Schedule',
      schedule: schedule_results.length ? schedule_results[0] : null
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/schedules/form',
      button: true
    });
  }
});

router.post('/schedules/form', async function (req, res, next) {
  try {
    if(req.body.Dailyfrequency === ''){
        var frequency = req.body.Sun + "," + 
                        req.body.Mon + "," + 
                        req.body.Tues + "," + 
                        req.body.Wed + "," + 
                        req.body.Thurs + "," + 
                        req.body.Fri + "," + 
                        req.body.Sat;
    }else{
       var frequency = req.body.Dailyfrequency;
    }
    var schedule_id = req.body.schedule_id;
    var start_date = req.body.startDate
    var end_date = req.body.endDate;
    var type = req.body.type;
    // var frequency = req.body.frequency;
    var skips = req.body.skips;
    console.log(start_date)
    console.log(end_date)

    // if (type == 'weekly') {
    //   var freq = frequency.split(',');
    //   if (freq.length != 7) {
    //     res.render('form_failure', {
    //       message: 'For "weekly" type, you have to enter 7 numbers in frequency field, comma-separated, and without spaces',
    //       redirect: '/website/schedules/form' + (schedule_id == -1 ? '' : '?schedule_id=' + schedule_id),
    //       button: true
    //     });
    //     return;
    //   }
    //   for (var i = 0; i < freq.length; ++i) {
    //     if (isNaN(freq[i])) {
    //       res.render('form_failure', {
    //         message: freq[i] + ' is not a valid number',
    //         redirect: '/website/schedules/form' + (schedule_id == -1 ? '' : '?schedule_id=' + schedule_id),
    //         button: true,
    //         timeout: 2000
    //       });
    //       return;
    //     }
    //   }
    // }
    // else {
    //   var freq = frequency.split(',');
    //   if (freq.length != 1) {
    //     res.render('form_failure', {
    //       message: 'For "dialy" type, you have to enter one number in frequency field',
    //       redirect: '/website/schedules/form' + (schedule_id == -1 ? '' : '?schedule_id=' + schedule_id),
    //       button: true
    //     });
    //     return;
    //   }
    //   if (isNaN(freq[0])) {
    //     res.render('form_failure', {
    //       message: freq[0] + ' is not a valid number',
    //       redirect: '/website/schedules/form' + (schedule_id == -1 ? '' : '?schedule_id=' + schedule_id),
    //       button: true
    //     });
    //     return;
    //   }
    // }
    req.session.schedule_form_error = null;
    if (schedule_id == -1) {
      await pool.query(`INSERT INTO _schedule (start_date, end_date,type,frequency,skips) VALUES (?,?,?,?,?)`, [start_date, end_date, type, frequency, skips]);
      res.render('form_success', {
        message: 'New record added',
        redirect: '/website/schedules'
      });
    }
    else {
      await pool.query(`UPDATE _schedule SET start_date = ?, end_date = ?,type = ?,frequency = ?,skips = ? WHERE id = ?`, [start_date, end_date, type, frequency, skips, schedule_id]);
      res.render('form_success', {
        message: 'Schedule updated',
        redirect: '/website/schedules'
      });
    }
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/schedules/form',
      button: true
    });
  }
});

router.post('/schedules/delete', async function (req, res, next) {
  try {
    var schedule_id = req.body.schedule_id;
    var activities = await pool.query(`SELECT a.* FROM activity a WHERE a.is_deleted = 0 AND a.schedule_id = ?`, schedule_id);
    var activities_list = [];
    for (var i = 0; i < activities.length; ++i) {
      activities_list.push(activities[i].id);
    }
    if (activities_list.length) {
      res.status(500).json({
        success: false,
        error: "This record is attached to activities with the following IDs: (" + activities_list.join(", ") +
          "). Please release them first"
      });
      return;
    }
    var result = await pool.query("UPDATE _schedule set is_deleted = 1 WHERE id = ?", schedule_id);
    res.status(200).json({
      success: true,
      result: result
    });
  }
  catch (error) {
    console.log(error);
    res.status(500).json({ success: false, error: error.sqlMessage ? error.sqlMessage : "Unknown error. Please contact admin" });
  }
});

// Event (Not Showing in UTSW Portal)
router.get('/events', async function (req, res, next) {
  try {
    var activity_id = req.query.activity_id ? req.query.activity_id : 'all';
    var number_of_days_since_start = req.query.number_of_days_since_start ? req.query.number_of_days_since_start : '';
    var occurrence_index_of_day = req.query.occurrence_index_of_day ? req.query.occurrence_index_of_day : '';
    var state = req.query.state ? req.query.state : 'all';
    var conditions = ` WHERE 1 AND b.is_deleted = 0 `;
    var parameters = [];
    if (activity_id != 'all') {
      conditions += ` AND a.activity_id = ? `;
      parameters.push(activity_id);
    }
    if (number_of_days_since_start != '') {
      conditions += ` AND a.number_of_days_since_start = ? `;
      parameters.push(number_of_days_since_start);
    }
    if (occurrence_index_of_day != '') {
      conditions += ` AND a.occurrence_index_of_day = ? `;
      parameters.push(occurrence_index_of_day);
    }
    if (state != 'all') {
      conditions += ` AND a.state = ? `;
      parameters.push(state);
    }
    var results = await pool.query(`SELECT a.*, b.title FROM _event a JOIN activity b ON a.activity_id = b.id` + conditions, parameters);
    var activities_results = await pool.query("SELECT * FROM activity WHERE is_deleted = 0");
    res.render('events', {
      title: 'Events',
      events: results,
      activities: activities_results,
      activity_id: activity_id,
      number_of_days_since_start: number_of_days_since_start,
      occurrence_index_of_day: occurrence_index_of_day,
      state: state
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/events',
      button: true
    });
  }
});

router.get('/events/form', async function (req, res, next) {
  try {
    var event_id = req.query.event_id ? req.query.event_id : -1;
    var event = await pool.query("SELECT a.*, b.is_deleted, b.id 'activity_id', b.title 'activity_title' FROM _event a JOIN activity b ON a.activity_id = b.id WHERE a.id = ?", event_id);
    if (event.length == 0) {
      res.render('form_failure', {
        message: "This event does not exist",
        redirect: prefix_url + '/events',
        button: true
      });
      return;
    }
    event = event[0];
    if (event.is_deleted) {
      res.render('form_failure', {
        message: "The activity (" + event.activity_id + ' | ' + event.activity_title + ") is deleted",
        redirect: prefix_url + '/events',
        button: true
      });
      return;
    }
    var activities_results = await pool.query("SELECT * FROM activity WHERE is_deleted = 0");
    res.render('events_form', {
      title: event_id != -1 ? 'Edit Event' : 'Add Event',
      event: event,
      activities: activities_results
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/events',
      button: true
    });
  }
});

router.post('/events/form', async function (req, res, next) {
  try {
    var event_id = req.body.event_id;
    var activity_id = req.body.activity_id;
    var number_of_days_since_start = req.body.number_of_days_since_start;
    var occurrence_index_of_day = req.body.occurrence_index_of_day;
    var state = req.body.state;
    if (event_id == -1) {
      await pool.query(`INSERT INTO _event (activity_id,number_of_days_since_start,occurrence_index_of_day,state)
        VALUES (?,?,?)`, [activity_id, number_of_days_since_start, occurrence_index_of_day, state]);
      res.render('form_success', {
        message: 'New record added',
        redirect: '/website/events'
      });
    }
    else {
      await pool.query(`UPDATE _event SET 
        activity_id = ?,number_of_days_since_start = ?,occurrence_index_of_day = ?,state = ?
        WHERE id = ?`, [activity_id, number_of_days_since_start, occurrence_index_of_day, state, event_id]);
      res.render('form_success', {
        message: 'Updated',
        redirect: '/website/events'
      });
    }
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/events/form?event_id=' + event_id,
      button: true
    });
  }
});

// Attempt
router.get('/attempts', async function (req, res, next) {
  try {
    var patient_id = req.query.patient_id ? req.query.patient_id : 'all';
    var activity_id = req.query.activity_id ? req.query.activity_id : 'all';
    var event_id = req.query.event_id ? req.query.event_id : 'all';
    var conditions = ` WHERE 1 `;
    var parameters = [];
    if (patient_id != 'all') {
      conditions += ` AND c.patient_id = ? `;
      parameters.push(patient_id);
    }
    if (activity_id != 'all') {
      conditions += ` AND c.id = ? `;
      parameters.push(activity_id);
    }
    if (event_id != 'all') {
      conditions += ` AND a.event_id = ? `;
      parameters.push(event_id);
    }
    var patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    var activities = await pool.query("SELECT * FROM activity WHERE is_deleted = 0");
    var results = await pool.query(`
      SELECT a.*, d.name 'patient_name', c.id 'activity_id', c.title 'activity_title', 
        e.name 'pain_assessment_name', f.name 'workout_assessment_name'
      FROM attempt a
      JOIN _event b ON a.event_id = b.id 
      JOIN activity c ON b.activity_id = c.id
      JOIN patient d ON c.patient_id = d.id
      LEFT JOIN pain_assessment e ON a.pain_assessment = e.id
      LEFT JOIN workout_assessment f ON a.workout_assessment = f.id
    ` + conditions, parameters);

    var heart_rates = await pool.query("SELECT attempt_id, count(*) as 'count', round (avg(value), 1) as 'avg', max(value) as 'max', min(value) as 'min' FROM heart_rate GROUP BY attempt_id");
    var heart_rates_map = []; for (var i = 0; i < heart_rates.length; ++i) {
      heart_rates_map[heart_rates[i].attempt_id] = heart_rates[i];
    }

    for (var i = 0; i < results.length; ++i) {
      var attempt_id = results[i].id;
      results[i].heart_rates_count = heart_rates_map[attempt_id] ? heart_rates_map[attempt_id].count : 0;
      results[i].heart_rates_avg = heart_rates_map[attempt_id] ? heart_rates_map[attempt_id].avg : 0;
      results[i].heart_rates_max = heart_rates_map[attempt_id] ? heart_rates_map[attempt_id].max : 0;
      results[i].heart_rates_min = heart_rates_map[attempt_id] ? heart_rates_map[attempt_id].min : 0;
    }

    var events_results = await pool.query("SELECT * FROM _event");

    // console.log({
    //   title: 'Attempts',
    //   attempts: results,
    //   events: events_results,
    //   patients: patients,
    //   activities: activities,
    //   patient_id: patient_id,
    //   activity_id: activity_id,
    //   event_id: event_id
    // })

    res.render('attempts', {
      title: 'Attempts',
      attempts: results,
      events: events_results,
      patients: patients,
      activities: activities,
      patient_id: patient_id,
      activity_id: activity_id,
      event_id: event_id
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/attempts',
      button: true
    });
  }
});

router.get('/attempts/report', async function (req, res, next) {
  try {
    var now = helper.current_timestamp();
    var rnd = parseInt(Math.random() * 10000);
    var attempt_id = req.query.attempt_id ? req.query.attempt_id : 'all';
    if (attempt_id == 'all') {
      res.status(200).json({
        success: false,
        error: "You have to provide one attempt"
      });
      return;
    }
    var attempts = await pool.query(`
      SELECT a.*, e.name 'patient_name', d.title 'activity_title'
      FROM heart_rate a
      JOIN attempt b ON a.attempt_id = b.id
      JOIN _event c ON b.event_id = c.id
      JOIN activity d ON c.activity_id = d.id
      JOIN patient e ON d.patient_id = e.id
      WHERE b.id = ?
    `, attempt_id);
    if (attempts.length == 0) {
      res.render('form_failure', {
        message: "No data found",
        redirect: prefix_url + '/attempts',
        button: true
      });
      return;
    }
    var array_string = "";
    array_string += 'Patient: ' + attempts[0].patient_name + "," + "" + ',Exercise: ' + attempts[0].activity_title + "\n";
    array_string += ",,\n";
    array_string += "Time, Heartrate (BPM),\n";
    for (var i = 0; i < attempts.length; ++i) {
      array_string += attempts[i].recorded_at + "," + attempts[i].value + ",\n";
    }
    let file = fs.createWriteStream(helper.public_path() + '/reports/attempts/TESTAttemptsReport-AttemptID_' + attempt_id + '-TIMESTAMP' + now + '_RND' + rnd + '.csv');
    await file.write(array_string);
    var read_stream = fs.createReadStream(helper.public_path() + '/reports/attempts/TESTAttemptsReport-AttemptID_' + attempt_id + '-TIMESTAMP' + now + '_RND' + rnd + '.csv');
    res.attachment('AttemptsReport-AttemptID_' + attempt_id + '-TIMESTAMP_' + now + '.csv');
    read_stream.pipe(res);
  }
  catch (error) {
    console.log('ERRORR: ', error);
    res.status(200).json({
      success: false,
      error: error
    });
  }
});

// Heart Rate
router.get('/heart_rates', async function (req, res, next) {
  try {
    var filter = req.query.filter ? true : false;
    var patient_id = req.query.patient_id ? req.query.patient_id : 'all';
    var activity_id = req.query.activity_id ? req.query.activity_id : 'all';
    var event_id = req.query.event_id ? req.query.event_id : 'all';
    var attempt_id = req.query.attempt_id ? req.query.attempt_id : 'all';
    var conditions = ` WHERE 1 AND d.is_deleted = 0 AND e.is_deleted = 0 `;
    var parameters = [];
    if (patient_id != 'all') {
      conditions += ` AND d.patient_id = ? `;
      parameters.push(patient_id);
    }
    if (activity_id != 'all') {
      conditions += ` AND d.id = ? `;
      parameters.push(activity_id);
    }
    if (event_id != 'all') {
      conditions += ` AND b.event_id = ? `;
      parameters.push(event_id);
    }
    if (attempt_id != 'all') {
      conditions += ` AND b.id = ? `;
      parameters.push(attempt_id);
    }
    var patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    var activities = await pool.query("SELECT * FROM activity WHERE is_deleted = 0");
    var events = await pool.query("SELECT * FROM _event");
    var attempts = await pool.query("SELECT * FROM attempt");
    results = [];
    if (filter) {
      results = await pool.query(`
        SELECT a.*, b.id 'attempt_id', e.name 'patient_name', d.id 'activity_id', d.title 'activity_title', c.id 'event_id', c.state 'event_state',
          c.number_of_days_since_start 'event_number_of_days_since_start', c.occurrence_index_of_day 'event_occurrence_index_of_day'
        FROM heart_rate a
        JOIN attempt b ON a.attempt_id = b.id
        JOIN _event c ON b.event_id = c.id 
        JOIN activity d ON c.activity_id = d.id
        JOIN patient e ON d.patient_id = e.id
      ` + conditions, parameters);
    }
    res.render('heart_rates', {
      title: 'Heart Rates',
      results: results,
      filter: filter,
      patients: patients,
      activities: activities,
      events: events,
      attempts: attempts,
      patient_id: patient_id,
      activity_id: activity_id,
      event_id: event_id,
      attempt_id: attempt_id
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/heart_rates',
      button: true
    });
  }
});

router.get('/heart_rate_variability', async function (req, res, next) {
  try {
    var patient_id = req.query.patient_id ? req.query.patient_id : 'all';
    var conditions = ` WHERE 1 AND b.is_deleted = 0 `;
    var parameters = [];
    if (patient_id != 'all') {
      conditions += ` AND b.id = ? `;
      parameters.push(patient_id);
    }
    var patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    results = await pool.query(`
      SELECT a.*, b.name 'patient_name'
      FROM heart_rate_variability a
      JOIN patient b ON a.patient_id = b.id
    ` + conditions, parameters);
    res.render('heart_rate_variability', {
      title: 'Heart Rate Variability',
      results: results,
      patients: patients,
      patient_id: patient_id,
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/heart_rate_variability',
      button: true
    });
  }
});

//VO2
router.get('/vo2_max', async function (req, res, next) {
  try {
    var patient_id = req.query.patient_id ? req.query.patient_id : 'all';
    var conditions = ` WHERE 1 AND b.is_deleted = 0 `;
    var parameters = [];
    if (patient_id != 'all') {
      conditions += ` AND b.id = ? `;
      parameters.push(patient_id);
    }
    var patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
    results = await pool.query(`
      SELECT a.*, b.name 'patient_name'
      FROM vo2_max a
      JOIN patient b ON a.patient_id = b.id
    ` + conditions, parameters);
    res.render('vo2_max', {
      title: 'VO2 Max',
      results: results,
      patients: patients,
      patient_id: patient_id,
    });
  }
  catch (error) {
    res.render('form_failure', {
      message: error,
      redirect: prefix_url + '/vo2_max',
      button: true
    });
  }
});

// Notification
router.get('/pushNotifications', async function (req, res, next) {
  var patients = await pool.query("SELECT * FROM patient WHERE is_deleted = 0");
  res.render('push_notifications', {
    title: 'Push Notifications',
    patients: patients
  });
});

router.post('/push/specific', async function (req, res, next) {
  try {
    var patients_ids = req.body.patients.split(",");
    var title = req.body.title;
    var body = req.body.body;
    var patients = await pool.query("SELECT * FROM patient WHERE id IN (?)", [patients_ids]);
    var device_tokens = [];
    for (var i = 0; i < patients.length; ++i) {
      device_tokens.push(patients[i].device_token);
    }
    var result = await helper.send_notification({
      device_tokens: device_tokens,
      title: title,
      body: body
    });
    if (result.success && result.result.failed.length) {
      var failed = result.result.failed;
      var failed_table = [];
      for (var i = 0; i < failed.length; ++i) {
        for (var j = 0; j < patients.length; ++j) {
          var token = failed[i].device;
          if (token == patients[i].device_token) {
            failed_table.push([patients[i].name, failed[i].response.reason]);
            break;
          }
        }
      }
      result.failed_table = failed_table;
    }
    res.json(result);
    return;
  }
  catch (error) {
    res.json(error.message);
  }
});

router.get('/push/scheduled/get', async function (req, res, next) {
  try {
    var patient_id = req.query.patient_id;
    var notification_times = await pool.query("SELECT * FROM notification_time WHERE patient_id = ?", patient_id);
    res.json({
      success: true,
      notification_times: notification_times
    });
  }
  catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

router.post('/push/scheduled/add', async function (req, res, next) {
  try {
    var patient_id = req.body.patient_id;
    var push_time = req.body.push_time;
    var check = await pool.query("SELECT * FROM notification_time WHERE patient_id = ? AND push_time = ?", [patient_id, push_time]);
    if (check.length) {
      res.json({
        success: false,
        error: "This time does exist for this patient"
      });
      return;
    }
    var result = await pool.query("INSERT INTO notification_time (patient_id, push_time) VALUES (?, ?)", [patient_id, push_time]);
    if (result.insertId) {
      var last_record = await pool.query("SELECT * FROM notification_time WHERE patient_id = ? ORDER BY id DESC LIMIT 1", patient_id);
      res.json({
        success: true,
        result: result,
        last_record: last_record[0]
      })
    }
  }
  catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

router.post('/push/scheduled/remove', async function (req, res, next) {
  try {
    var notification_id = req.body.notification_id;
    var result = await pool.query("DELETE FROM notification_time WHERE id = ?", [notification_id]);
    if (result.affectedRows) {
      res.json({
        success: true,
        result: result
      })
    }
  }
  catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

//CHAT 
router.get('/chat',cors(), function(req,res){
  res.render("chat");
});

module.exports = router;
