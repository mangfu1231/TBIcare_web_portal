var express = require('express');
var router = express.Router();
var pool = require('../config/db'); // mysql pool of connections
var bcrypt = require('bcrypt');
var async = require('async');
var https = require('https');
var http = require('http');
var moment = require('moment');
var moment = require('moment-timezone');
var fs = require('fs');
var util = require('util');
var csv = require('fast-csv');
var helper = require('./helper');

router.get('/sql_injection', async function (req, res, next) {
    var id = req.query.id;
    var result = await pool.query("SELECT * FROM patient WHERE id = ?", id);
    res.json(result);
});

router.get('/fix_heart_rates', async function (req, res, next) {
    var attempts = await pool.query(`select * from attempt`);
    for (var i = 0; i < attempts.length; ++i) {
        var array = attempts[i].heart_rates.split(",");
        for (var j = 0; j < array.length; ++j) {
            var value = parseInt(array[j]);
            if (!value || isNaN(value)) continue;
            await pool.query("INSERT INTO heart_rate (value, recorded_at, attempt_id) VALUES (?,?,?)",
                [value, attempts[i].created_at, attempts[i].id]);
        }
    }
});

router.get('/test_csv', async function (req, res, next) {

    try {
        var array = [];
        array.push(['Patient: Mohammad', '', 'Hell']);
        array.push([]);
        array.push(['h1', 'h2', 'h3', 'h4', 'h5']);
        array.push(['v1', 'v2', 'v3', 'v4', 'v5']);
        array.push(['v1', 'v2', 'v3', 'v4', 'v5']);

        var file = fs.createWriteStream(process.cwd() + '/public/my1.csv');
        await csv.write(array, { headers: true }).pipe(file);
        var read_stream = fs.createReadStream(process.cwd() + '\\public\\my1.csv');
        res.attachment('file2.csv');
        // pipe readable source to writable destination
        read_stream.pipe(res);
    }
    catch (error) {
        res.json(error);
    }

});

router.get('/score_test', async function (req, res, next) {
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
            res.json(score); return;
            console.log(patient_id);
            console.log(score);
            if (score.badge_type > 0) {
                var insert = await connection.query(`INSERT INTO weekly_score (week_number, patient_id, achieved_time, target_time, badge_type)
                VALUES (?,?,?,?,?)`, [week_number, patient_id, score.achieved_time, score.target_time, score.badge_type]);
                final_result.push({
                    patient_id: patient_id,
                    result: insert
                });
            }
            else {
                console.log('here');
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