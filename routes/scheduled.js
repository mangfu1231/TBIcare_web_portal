var express = require('express');
var router = express.Router();
var pool = require('../config/db'); // mysql pool of connections
var options = require('../config/end_of_week'); // mysql pool of connections
var helper = require('./helper');
var bcrypt = require('bcrypt');
var async = require('async');
var https = require('https');
var http = require('http');
const util = require('util');

router.use(function (req, res, next) {
    var token = req.headers['authorization'];
    if (token == 'TBI**CARE##675@@') next();
    else {
        res.status(500).json({
            success: false,
            error: 'Invalid token'
        });
    }
});

// 18.221.228.206

// invoked every minute
router.get('/sendNotification', async function (req, res, next) {
    try {
        var today = helper.current_date();
        var date = new Date();
        var hour = (date.getHours() + "").padStart(2, '0');
        var minute = (date.getMinutes() + "").padStart(2, '0');
        var cur_time = hour + ':' + minute + ':00';
        var dow = date.getDay();
        var times = await pool.query(`
        SELECT a.id 'patient_id', a.device_token, b.push_time
        FROM patient a
        JOIN notification_time b ON a.id = b.patient_id
        WHERE a.is_deleted = 0 AND b.push_time = ?`, cur_time);
        var patients = [];
        var device_tokens = [];
        for (var i = 0; i < times.length; ++i) {
            // get all patient's activities and schedules
            var activities = await pool.query(`
            SELECT a.id 'activity_id', a.patient_id, b.id 'schedule_id', b.type 'schedule_type', b.frequency 'schedule_frequency'
            FROM activity a 
            JOIN _schedule b ON a.schedule_id = b.id
            WHERE a.is_deleted = 0
            AND a.patient_id = ?
            AND b.end_date >= ?`, [times[i].patient_id, today]);
            var flag = false;
            for (var j = 0; j < activities.length; ++j) {
                var freq = -1;
                if (activities[i].schedule_type == 'daily') {
                    freq = activities[i].schedule_frequency;
                    flag = freq != '0';
                }
                else {
                    var week_days = activities[i].schedule_frequency.split(",");
                    freq = week_days[dow];
                    flag = freq != '0';
                }
                if (flag) {
                    // get the events for the current activity
                    var event_count = await pool.query(`
                    SELECT count(*) 'count'
                    FROM _event a
                    JOIN activity b ON a.activity_id = b.id
                    WHERE a.activity_id = ? AND a.number_of_days_since_start = DATEDIFF(now(), b.start_date) AND a.state = '2'
                    `, activities[i].activity_id);
                    if (event_count[0].count < freq) break;
                    flag = false;
                }
            }
            if (flag) {
                patients.push(times[i].patient_id);
                device_tokens.push(times[i].device_token);
            }
        }
        var result = await helper.send_notification({
            device_tokens: device_tokens,
            title: "Time for the next workout ⏰",
            body: "Keep your record running 💪"
        });
        res.json({
            success: true,
            patients: patients,
            result: result
        });
    }
    catch (error) {
        res.json({
            success: false,
            error: error.message
        })
    }
});

// invoked once every Sunday 
router.get('/scoreEvaluation', async function (req, res, next) {
    var connection = await pool.getConnection(); // if you want to use the result of transactional query in another query you have to use the same connection object
    connection.query = util.promisify(connection.query);
    await connection.beginTransaction();
    try {
        var week_number = await connection.query("SELECT max(week_number) 'max' from weekly_score");
        if (week_number[0].max) week_number = week_number[0].max + 1;
        else week_number = 1;
        var final_result = [];
        var patients = await connection.query("SELECT * FROM patient WHERE is_deleted = 0");
        for (var i = 0; i < patients.length; ++i) {
            var patient_id = patients[i].id;
            var score = await helper.calc_score_data(patient_id);
            if (score.badge_type > 0) {
                var insert = await connection.query(`INSERT INTO weekly_score (week_number, patient_id, achieved_time, target_time, badge_type)
                VALUES (?,?,?,?,?)`, [week_number, patient_id, score.achieved_time, score.target_time, score.badge_type]);
                final_result.push({
                    patient_id: patient_id,
                    result: insert
                });
            }
            else {
                final_result.push({
                    patient_id: patient_id,
                    result: 'No badge earned'
                });
            }
        }
        await connection.commit();
        res.json({
            success: true,
            week_number: week_number,
            result: final_result
        });
    }
    catch (error) {
        await connection.release();
        res.json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;

