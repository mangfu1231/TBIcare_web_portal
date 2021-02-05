var express = require('express');
var router = express.Router();
var pool = require('../config/db'); // mysql pool of connections
var util = require('util');
var bcrypt = require('bcrypt');
var moment = require('moment');
var moment_timezone = require('moment-timezone');
var helper = require('./helper');

// log the request 
router.use(function (req, res, next) {
    console.log({
        timestamp: new Date(),
        url: '/api' + req.url,
        method: req.method,
        query: req.query,
        body: req.body
    });
    next();
});

// validate session
router.use(async function (req, res, next) {
    var url = req.url;
    if (url == '/login') {
        next();
        return;
    }
    if (url != '/login') {
        var token = req.headers['authorization'];
        if (!token) {
            res.status(500).json({
                success: false,
                error: 'Token required'
            });
            return;
        }
        var results = await pool.query("SELECT * FROM patient WHERE token = ?", token);
        if (results.length == 0) {
            res.status(500).json({
                success: false,
                error: 'Invalid token'
            });
            return;
        }
        req.patient_id = results[0].id;
        next();
    }
    else next();
});

router.post('/login', async function (req, res, next) {
    try {
        var username = req.body.username;
        var password = req.body.password;
        var results = await pool.query("SELECT * FROM patient WHERE username = ?", username);
        if (results.length == 0) {
            res.status(500).json({
                success: false,
                error: 'Username not found'
            });
            return;
        }
        if (!bcrypt.compareSync(password, results[0].password)) {
            res.status(500).json({
                success: false,
                error: 'Invalid Password'
            });
            return;
        }
        if (results[0].token) { // allow multiple users to login in the same account together
            res.status(200).json({
                success: true,
                token: results[0].token
            });
            return;
        }
        var timestamp = new Date();
        var token = bcrypt.hashSync(username + timestamp, 10);
        var results = await pool.query("UPDATE patient SET token = ?, token_timestamp = ? WHERE username = ?", [token, timestamp, username]);
        if (!results.affectedRows) {
            res.status(500).json({
                success: false,
                error: 'No records updated. Please check SQL error',
                sql_error: results.message
            });
            return;
        }
        res.status(200).json({
            success: true,
            token: token
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/logout', async function (req, res, next) {
    try {
        var patient_id = req.patient_id;
        var results = await pool.query("UPDATE patient set token = '', token_timestamp = NULL WHERE id = ?", [patient_id]);
        if (!results.affectedRows) {
            res.status(500).json({
                success: false,
                error: 'No records updated. Please check SQL error',
                sql_error: results.message
            });
            return;
        }
        res.status(200).json({
            success: true
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/activities', async function (req, res, next) {
    try {
        var patient_id = req.patient_id;
        var results = await pool.query(`SELECT a.*, b.end_date, b.type 'schedule_type', b.frequency, b.skips,
                c.apple_id 'workout_type_apple_id', c.name 'workout_type_name', c.category 'workout_type_category'
                FROM activity a
                JOIN _schedule b ON a.schedule_id = b.id 
                LEFT JOIN workout_type c ON a.workout_type = c.id
                WHERE patient_id = ? AND a.is_deleted = 0`, patient_id);
        var events_results = await pool.query("SELECT * FROM _event");
        for (var i = 0; i < results.length; ++i) {
            results[i].id = results[i].id + '';
            results[i].result_resettable = results[i].result_resettable ? true : false;
            results[i].optional = results[i].optional ? true : false;
            results[i].start_date += ' 00:00:00';
            results[i].workout_type = {
                id: results[i].workout_type_apple_id + '',
                name: results[i].workout_type_name,
                category: results[i].workout_type_category
            };
            delete results[i].workout_type_apple_id;
            delete results[i].workout_type_name;
            delete results[i].workout_type_category;
            results[i].schedule = {
                end_date: results[i].end_date + ' 00:00:00',
                type: results[i].schedule_type,
                frequency: results[i].frequency.split(','),
                skips: results[i].skips
            };
            delete results[i].end_date;
            delete results[i].schedule_type;
            delete results[i].freuqncy;
            delete results[i].skips;
            var events = [];
            for (var j = 0; j < events_results.length; ++j) {
                events_results[j].activity_id = events_results[j].activity_id + '';
                events_results[j].id = events_results[j].id + '';
                if (events_results[j].activity_id == results[i].id) {
                    events.push(events_results[j]);
                }
            }
            results[i].events = events;
        }
        res.status(200).json(results);
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/event', async function (req, res, next) {
    try {
        var patient_id = req.patient_id;
        var activity_id = req.body.activity_id + '';
        var number_of_days_since_start = req.body.number_of_days_since_start + '';
        var occurrence_index_of_day = req.body.occurrence_index_of_day + '';
        var state = req.body.state + '';
        var results = await pool.query("SELECT * FROM _event WHERE activity_id = ? AND number_of_days_since_start = ? AND occurrence_index_of_day = ?",
            [activity_id, number_of_days_since_start, occurrence_index_of_day]);
        if (results.length == 0) {
            var results = await pool.query(`INSERT INTO _event (activity_id, number_of_days_since_start, occurrence_index_of_day, state) VALUES (?,?,?,?)`, [activity_id, number_of_days_since_start, occurrence_index_of_day, state]);
            if (results.insertId) {
                var results = await pool.query("SELECT * FROM _event WHERE id = ?", [results.insertId]);
                results[0].id = results[0].id + '';
                res.status(200).json({
                    success: true,
                    message: 'New event created',
                    data: results[0]
                });
            }
        }
        else {
            var results = await pool.query(`UPDATE _event SET state = ? WHERE activity_id = ? AND number_of_days_since_start = ? AND occurrence_index_of_day = ?`, [state, activity_id, number_of_days_since_start, occurrence_index_of_day]);
            if (!results.affectedRows) {
                res.status(500).json({
                    success: false,
                    error: 'No records updated. Please check SQL error',
                    sql_error: results.message
                });
                return;
            }
            var results = await pool.query("SELECT * FROM _event WHERE activity_id = ?", activity_id);
            results[0].id = results[0].id + '';
            res.status(200).json({
                success: true,
                message: 'Event record updated',
                data: results[0]
            });
        }
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/attempt', async function (req, res, next) {
    var connection = await pool.getConnection(); // if you want to use the result of transactional query in another query you have to use the same connection object
    connection.query = util.promisify(connection.query);
    await connection.beginTransaction();
    try {

        var patient_id = req.patient_id;
        var activity_id = req.body.activity_id;
        var number_of_days_since_start = req.body.number_of_days_since_start;
        var occurrence_index_of_day = req.body.occurrence_index_of_day;
        var heart_rates = req.body.heart_rates;
        var steps = req.body.steps;
        var distance = req.body.distance;
        var time = req.body.time;
        var pain_assessment = req.body.pain_assessment;
        var active_energy_burned = req.body.active_energy_burned;
        var activities_results = await pool.query("SELECT * FROM activity WHERE id = ?", activity_id);
        if (activities_results.length == 0) {
            await connection.rollback();
            res.status(500).json({ success: false, error: "Activity not found" });
            return;
        }
        activities_results = activities_results[0];
        if (activities_results.is_deleted == '1') {
            await connection.rollback();
            res.status(500).json({ success: false, error: "Activity is deleted" });
            return;
        }
        var event_results = await pool.query(`SELECT * FROM _event WHERE activity_id = ? AND number_of_days_since_start = ? AND occurrence_index_of_day = ?`,
            [activity_id, number_of_days_since_start, occurrence_index_of_day]);
        if (event_results.length == 0) {
            var state = time >= activities_results.target_time ? '2' : '1';
            var insert_event_results = await connection.query(`INSERT INTO _event (activity_id, number_of_days_since_start, occurrence_index_of_day, state) 
                VALUES (?,?,?,'` + state + `')`, [activity_id, number_of_days_since_start, occurrence_index_of_day]);
            var insert_attempt_results = await connection.query(`INSERT INTO attempt (event_id, steps, distance, time, pain_assessment, active_energy_burned) 
                VALUES (?,?,?,?,?,?)`, [insert_event_results.insertId, steps, distance, time, pain_assessment, active_energy_burned]);
            if (insert_attempt_results.insertId) {
                for (var i = 0; i < heart_rates.length; ++i) {
                    await connection.query("INSERT INTO heart_rate (attempt_id, value, recorded_at) VALUES (?,?,?) ",
                        [insert_attempt_results.insertId, heart_rates[i].value, heart_rates[i].recorded_at]);
                }
                var heart_rates_query = await connection.query("SELECT id, value, recorded_at, created_at FROM heart_rate WHERE attempt_id = ?", insert_attempt_results.insertId);
                var new_attempt = await connection.query("SELECT * FROM attempt WHERE id = ?", [insert_attempt_results.insertId]);
                if (new_attempt.length == 0) {
                    await connection.rollback();
                    res.status(500).json({ success: false, error: "No attempts found" });
                    return;
                }
                new_attempt = new_attempt[0];
                new_attempt.patient_id = activities_results.patient_id;
                new_attempt.id = new_attempt.id + '';
                new_attempt.heart_rates = heart_rates_query;
                res.status(200).json({
                    success: true,
                    message: 'New attempt created',
                    data: new_attempt
                });
            }
            else {
                res.status(500).json({ success: false, error: "Failed to insert the attempt" });
            }
        }
        else if (event_results.length > 1) {
            await connection.rollback();
            res.status(500).json({ success: false, error: "Ambiguous reference to event record. More that one match found" });
            return;
        }
        else {
            var event_id = event_results[0].id;
            var results = await connection.query(`INSERT INTO attempt (event_id, steps, distance, time, pain_assessment, active_energy_burned) 
                VALUES (?,?,?,?,?,?)`, [event_id, steps, distance, time, pain_assessment, active_energy_burned]);
            if (results.insertId) {
                for (var i = 0; i < heart_rates.length; ++i) {
                    await connection.query("INSERT INTO heart_rate (attempt_id, value, recorded_at) VALUES (?,?,?) ",
                        [results.insertId, heart_rates[i].value, heart_rates[i].recorded_at]);
                }
                if (time >= activities_results.target_time) { // end of event
                    var update_results = await connection.query("UPDATE _event SET state = '2' WHERE activity_id = ? AND number_of_days_since_start = ? AND occurrence_index_of_day = ? ",
                        [activity_id, number_of_days_since_start, occurrence_index_of_day]);
                    if (!update_results.affectedRows) {
                        await connection.rollback();
                        res.status(500).json({ success: false, error: "No records updated. " + update_results.message });
                        return;
                    }
                }
                var new_attempt = await connection.query("SELECT * FROM attempt WHERE id = ?", results.insertId);
                new_attempt = new_attempt[0];
                var heart_rates_query = await connection.query("SELECT id, value, recorded_at, created_at FROM heart_rate WHERE attempt_id = ?", results.insertId);
                new_attempt.patient_id = activities_results.patient_id;
                new_attempt.id = new_attempt.id + '';
                new_attempt.heart_rates = heart_rates_query;
                res.status(200).json({
                    success: true,
                    message: 'New attempt created',
                    data: new_attempt
                });
            }
            else {
                res.status(500).json({ success: false, error: "Failed to insert the attempt" });
            }
        }
        await connection.commit();
    }
    catch (error) {
        await connection.rollback();
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
    finally {
        await connection.release();
    }
});

router.get('/attempt', async function (req, res, next) {
    try {
        var patient_id = req.patient_id;
        var patient_results = await pool.query("SELECT * FROM patient WHERE id = ?", patient_id);
        if (patient_results.length == 0) {
            res.status(500).json({ success: false, error: 'Invalid patient ID' }); return;
        }
        var results = await pool.query(`SELECT 
        a.id, a.steps, a.distance, a.time, a.pain_assessment, a.active_energy_burned, a.created_at,

        b.id 'event_id', b.activity_id 'event_activity_id', b.number_of_days_since_start 'event_number_of_days_since_start', 
        b.occurrence_index_of_day 'event_occurrence_index_of_day', b.state 'event_state', b.created_at 'event_created_at',

        c.id 'activity_id', c.patient_id 'activity_patient_id', c.group_id 'activity_group_id', c.type 'activity_type', c.subtype 'activity_subtype',
        c.location_type 'activity_location_type', c.title 'activity_title', c.title 'activity_title', c.instructions 'activity_instructions',
        c.image_url 'activity_image_url', c.color 'activity_color', c.result_resettable 'activity_result_resettable', c.schedule_id 'activity_schedule_id',
        c.optional 'activity_optional', c.target_heart_rate 'activity_target_heart_rate', c.target_steps 'activity_target_steps',
        c.target_distance 'activity_target_distance', c.target_time 'activity_target_time', c.summary 'activity_summary', c.start_date 'activity_start_date',
        c.created_at 'activity_created_at', c.updated_at 'activity_updated_at',

        d.id 'schedule_id', d.end_date 'schedule_end_date', d.type 'schedule_type', d.frequency 'schedule_frequency', d.skips 'schedule_skips', 
        d.created_at 'schedule_created_at',

        f.apple_id 'workout_type_apple_id', f.name 'workout_type_name', f.category 'workout_type_category'

        FROM attempt a
        JOIN _event b ON a.event_id = b.id
        JOIN activity c ON b.activity_id = c.id
        JOIN _schedule d ON c.schedule_id = d.id
        JOIN patient e ON c.patient_id = e.id
        LEFT JOIN workout_type f ON c.workout_type = f.id
        WHERE e.id = ?
        ORDER BY a.created_at DESC`, patient_id);

        for (var i = 0; i < results.length; ++i) {

            var heart_rates = await pool.query("SELECT id, value, recorded_at, created_at FROM heart_rate WHERE attempt_id = ?", results[i].id);

            results[i].id = results[i].id + '';
            results[i].heart_rates = heart_rates;

            results[i].event = {
                id: results[i].event_id + '',
                activity_id: results[i].event_activity_id,
                number_of_days_since_start: results[i].event_number_of_days_since_start,
                occurrence_index_of_day: results[i].event_occurrence_index_of_day,
                state: results[i].event_state,
                created_at: results[i].event_created_at,
            };
            delete results[i].event_id;
            delete results[i].event_activity_id;
            delete results[i].event_number_of_days_since_start;
            delete results[i].event_occurrence_index_of_day;
            delete results[i].event_state;
            delete results[i].event_created_at;

            results[i].activity = {
                id: results[i].activity_id + '',
                patient_id: results[i].activity_patient_id,
                group_id: results[i].activity_group_id,
                type: results[i].activity_type,
                subtype: results[i].activity_subtype,
                workout_type: {
                    id: results[i].workout_type_apple_id,
                    name: results[i].workout_type_name,
                    category: results[i].workout_type_category
                },
                location_type: results[i].activity_location_type,
                title: results[i].activity_title,
                text: results[i].activity_text,
                instructions: results[i].activity_instructions,
                image_url: results[i].activity_image_url,
                color: results[i].activity_color,
                result_resettable: results[i].activity_result_resettable,
                optional: results[i].activity_optional,
                target_heart_rate: results[i].activity_target_heart_rate,
                target_steps: results[i].activity_target_steps,
                target_distance: results[i].activity_target_distance,
                target_time: results[i].activity_target_time,
                summary: results[i].activity_summary,
                start_date: results[i].activity_start_date + ' 00:00:00',
                created_at: results[i].activity_created_at,
                updated_at: results[i].activity_updated_at,
                schedule: {
                    id: results[i].schedule_id + '',
                    end_date: results[i].schedule_end_date + ' 00:00:00',
                    type: results[i].schedule_type,
                    frequency: results[i].schedule_frequency,
                    skips: results[i].schedule_skips,
                    created_at: results[i].schedule_created_at
                },
            };

            delete results[i].activity_id;
            delete results[i].activity_patient_id;
            delete results[i].activity_group_id;
            delete results[i].activity_type;
            delete results[i].activity_subtype;
            delete results[i].workout_type_apple_id;
            delete results[i].workout_type_name;
            delete results[i].workout_type_category;
            delete results[i].activity_location_type;
            delete results[i].activity_title;
            delete results[i].activity_instructions;
            delete results[i].activity_image_url;
            delete results[i].activity_color;
            delete results[i].activity_result_resettable;
            delete results[i].activity_schedule_id;
            delete results[i].activity_optional;
            delete results[i].activity_target_heart_rate;
            delete results[i].activity_target_steps;
            delete results[i].activity_target_distance;
            delete results[i].activity_target_time;
            delete results[i].activity_summary;
            delete results[i].activity_start_date;
            delete results[i].activity_created_at;
            delete results[i].activity_updated_at;
            delete results[i].schedule_id;
            delete results[i].schedule_end_date;
            delete results[i].schedule_type;
            delete results[i].schedule_frequency;
            delete results[i].schedule_skips;
            delete results[i].schedule_created_at;
        }
        var score = await helper.calc_score_data(patient_id);
        score.ratio = Math.round(score.ratio * 100) / 100.;
        res.status(200).json({
            success: true,
            score: {
                gained: score.achieved_time,
                total: score.target_time,
                ratio: score.ratio,
                badges_count: score.badges_count
            },
            attempts: results
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/painAssessment', async function (req, res, next) {
    var connection = await pool.getConnection(); // if you want to use the result of transactional query in another query you have to use the same connection object
    connection.query = util.promisify(connection.query);
    await connection.beginTransaction();
    try {
        var attempt_id = req.body.attempt_id;
        var assessment = !isNaN(req.body.assessment) ? req.body.assessment : null; // body assessment
        var workout_assessment = !isNaN(req.body.workout_assessment) ? req.body.workout_assessment : null;
        if (!(assessment >= 0) && !(workout_assessment >= 0)) {
            res.status(500).json({ success: false, error: "You have to provide at least one value" });
            return;
        }
        if (assessment !== null && assessment >= 0) {
            var check_body_assessment = await pool.query("SELECT * FROM pain_assessment WHERE id = ?", assessment);
            if (check_body_assessment.length == 0) {
                res.status(500).json({
                    success: false,
                    error: "Body assessment value is invalid"
                });
                return;
            }
        }
        if (workout_assessment !== null && workout_assessment >= 0) {
            var check_workout_assessment = await pool.query("SELECT * FROM workout_assessment WHERE id = ?", workout_assessment);
            if (check_workout_assessment.length == 0) {
                res.status(500).json({
                    success: false,
                    error: "Workout assessment value is invalid"
                });
                return;
            }
        }
        if (assessment !== null && assessment >= 0) {
            var results_assessment = await connection.query("UPDATE attempt SET pain_assessment = ? WHERE id = ?", [assessment, attempt_id]);
            if (!results_assessment.affectedRows) {
                res.status(500).json({
                    success: false,
                    error: 'No records updated. Please check SQL error',
                    sql_error: results_assessment.message
                });
                return;
            }
        }
        if (workout_assessment !== null && workout_assessment >= 0) {
            var results_workout_assessment = await connection.query("UPDATE attempt SET workout_assessment = ? WHERE id = ?", [workout_assessment, attempt_id]);
            if (!results_workout_assessment.affectedRows) {
                res.status(500).json({
                    success: false,
                    error: 'No records updated. Please check SQL error',
                    sql_error: results_workout_assessment.message
                });
                return;
            }
        }
        await connection.commit();
        res.status(200).json({
            success: true,
            message: 'Attempt updated successfully'
        });
    }
    catch (error) {
        await connection.rollback();
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
    finally {
        await connection.release();
    }
});


// Every patient has number of care team contacts (patient.care_team_contact_id = contact.id)
// Every contact has type (contact.type = contact_type.id), and contact_items (contact.contact_items = contact_info.id)
router.get('/connect', async function (req, res, next) {
    try {
        var patient_id = req.patient_id;
        var results = await pool.query(`SELECT * FROM patient where id = ?`, patient_id);
        delete results[0].password;
        delete results[0].token;
        var contact_results = await pool.query("SELECT a.*, b.english 'contact_type' FROM contact a JOIN contact_type b ON a.type = b.id");

        var contact_map = [];
        for (var i = 0; i < contact_results.length; ++i) {
            contact_map[contact_results[i].id] = contact_results[i];
        }

        var contact_info_results = await pool.query("SELECT * FROM contact_info");

        var contact_info_map = {};
        for (var i = 0; i < contact_info_results.length; ++i) {
            contact_info_map[contact_info_results[i].id] = contact_info_results[i];
        }

        // adjust categories
        results[0].categories = results[0].categories ? results[0].categories.split(",") : [];

        // adjust care team contacts
        results[0].care_team_contact_id += '';
        results[0].care_team_contacts = results[0].care_team_contact_id ? results[0].care_team_contact_id.split(",") : [];
        delete results[0].care_team_contact_id;

        // adjust contact_info for the care team contacts
        for (var i = 0; i < results[0].care_team_contacts.length; ++i) {
            var id = results[0].care_team_contacts[i];
            var contact = contact_map[id];

            results[0].care_team_contacts[i] = contact;
            results[0].care_team_contacts[i].contact_items = results[0].care_team_contacts[i].contact_items ? results[0].care_team_contacts[i].contact_items.split(",") : [];

            for (var j = 0; j < results[0].care_team_contacts[i].contact_items.length; ++j) {
                var item_id = results[0].care_team_contacts[i].contact_items[j];
                var contact_info = contact_info_map[item_id];
                results[0].care_team_contacts[i].contact_items[j] = contact_info;
            }
        }

        res.status(200).json({
            success: true,
            patient: results[0]
        });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/heart_rate_variability', async function (req, res, next) {
    var connection = await pool.getConnection();
    connection.query = util.promisify(connection.query);
    await connection.beginTransaction();
    try {
        var patient_id = req.patient_id;
        var heart_rate_variabilities = req.body.heart_rate_variabilities ? req.body.heart_rate_variabilities : [];
        for (var i = 0; i < heart_rate_variabilities.length; ++i) {
            await connection.query("INSERT INTO heart_rate_variability (patient_id, value, recorded_at) VALUES (?,?,?)",
                [patient_id, heart_rate_variabilities[i].value, heart_rate_variabilities[i].recorded_at]);
        }
        await connection.commit();
        res.status(200).json({ success: true });
    }
    catch (error) {
        await connection.rollback();
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
    finally {
        await connection.release();
    }
});

router.post('/vo2_max', async function (req, res, next) {
    var connection = await pool.getConnection();
    connection.query = util.promisify(connection.query);
    await connection.beginTransaction();
    try {
        var patient_id = req.patient_id;
        var vo2_max = req.body.vo2_max ? req.body.vo2_max : [];
        for (var i = 0; i < vo2_max.length; ++i) {
            await connection.query("INSERT INTO vo2_max (patient_id, value, recorded_at) VALUES (?,?,?)",
                [patient_id, vo2_max[i].value, vo2_max[i].recorded_at]);
        }
        await connection.commit();
        res.status(200).json({ success: true });
    }
    catch (error) {
        await connection.rollback();
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
    finally {
        await connection.release();
    }
});

router.post('/device_token', async function (req, res, next) {
    var connection = await pool.getConnection();
    connection.query = util.promisify(connection.query);
    await connection.beginTransaction();
    try {
        var patient_id = req.patient_id;
        var device_token = req.body.device_token;
        if (!device_token) {
            res.status(500).json({ success: false, error: "You have to provide device token" });
            return;
        }
        await connection.query("UPDATE patient SET device_token = ? WHERE id = ?", [device_token, patient_id]);
        await connection.commit();
        res.status(200).json({ success: true });
    }
    catch (error) {
        await connection.rollback();
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
    finally {
        await connection.release();
    }
});

module.exports = router;
