var apn = require('apn');
var pool = require('../config/db');
var util = require('util');
var moment = require('moment');

module.exports = {
    current_timestamp: function () {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth() + 1;
        var day = now.getDate();
        var hour = now.getHours();
        var minute = now.getMinutes();
        var second = now.getSeconds();

        return year + '-' + (month + "").padStart(2, '0') + '-' + (day + '').padStart(2, '0') + '_' + (hour + '').padStart(2, '0') + '-' + (minute + '').padStart(2, '0') +
            '-' + (second + '').padStart(2, '0');
    },

    current_date: function () {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth() + 1;
        var day = now.getDate();

        return year + '-' + (month + "").padStart(2, '0') + '-' + (day + '').padStart(2, '0');
    },

    current_time: function () {
        var now = new Date();
        var hour = now.getHours();
        var minute = now.getMinutes();
        var second = now.getSeconds();

        return (hour + '').padStart(2, '0') + '-' + (minute + '').padStart(2, '0') + '-' + (second + '').padStart(2, '0');
    },

    base: function () {
        return process.cwd();
    },

    public_path: function () {
        return process.cwd() + '/public';
    },

    send_notification: async function (params) {
        try {
            var topic = "com.AmmarAlTahhan.UTA-TBIcare";
            let provider = new apn.Provider({
                token: {
                    key: "/home/ubuntu/APNCertificate/AuthKey_MFLWS467B7.p8",
                    keyId: "MFLWS467B7",
                    teamId: "B8UCDP9M4Y"
                },
                production: true
            });
            var device_tokens = params.device_tokens ? params.device_tokens : [];
            if (!Array.isArray(device_tokens)) {
                return {
                    success: false,
                    error: "Failed. Tokens have to be an array type"
                }
            }
            if (!device_tokens.length) {
                return {
                    success: false,
                    error: "Failed. No tokens provided"
                }
            }
            var title = params.title ? params.title : 'Title';
            var body = params.body ? params.body : 'Body';
            var badge = params.badge ? params.badge : 1;
            var sound = params.sound ? params.sound : 'default';
            var alert = params.alert ? params.alert : null;
            var payload = params.payload ? params.payload : null;
            var expiry = params.expiry ? params.expiry : null;
            var encoding = params.encoding ? params.encoding : null;
            var notifiation = new apn.Notification();
            notifiation.topic = topic;
            notifiation.title = title;
            notifiation.body = body;
            notifiation.badge = badge;
            if (expiry) notifiation.expiry = expiry;
            if (sound) notifiation.sound = sound;
            if (alert) notifiation.alert = alert;
            if (payload) notifiation.payload = payload;
            if (encoding) notifiation.encoding = encoding;
            var result = await provider.send(notifiation, device_tokens);
            console.log('Notifications: ', result);
            return {
                success: true,
                result: result
            }
        } catch (error) {
            return {
                success: false,
                error: "Failed. " + error.message
            }
        }
    },

    calc_score_data: async function (patient_id) {
        try {
            var patient = await pool.query("SELECT * FROM patient WHERE id = ?", patient_id);
            if (patient.length == 0) {
                throw "Patient id " + patient_id + " not found";
            }
            patient = patient[0];
            var badges_count = [0, 0, 0];
            var badges = await pool.query("SELECT * FROM weekly_score WHERE patient_id = ?", patient_id);
            for (var i = 0; i < badges.length; ++i) {
                ++badges_count[parseInt(badges[i].badge_type) - 1];
            }
            var activities = await pool.query(`
            SELECT b.*, a.target_time
            FROM activity a
            JOIN _schedule b ON a.schedule_id = b.id
            WHERE a.is_deleted = 0 
            AND b.is_deleted = 0
            AND a.patient_id = ?`, patient_id);
            var target_time = 0;
            for (var i = 0; i < activities.length; ++i) {
                // calculate the target time
                // check if the end date is in the middle of the week
                var start_of_week = moment().startOf('week').format('YYYY-MM-DD'); // get the last Sunday date
                var end_of_schedule = moment(activities[i].end_date, 'YYYY-MM-DD');
                var difference = end_of_schedule.diff(start_of_week, 'days');
                if (difference < 0) continue; // if the end date is in the past
                difference = Math.min(difference + 1, 7); // how many days to iterate over
                var frequency = activities[i].frequency.split(",");
                if (activities[i].type == 'daily') {
                    frequency = Array(7).fill(activities[i].frequency);
                }
                // calculate the total required time for this activity
                for (var j = 0; j < difference; ++j) {
                    frequency[j] = parseInt(frequency[j]);
                    target_time += frequency[j] * activities[i].target_time;
                }
            }
            // calculate the actual time 
            var achieved_time = await pool.query(`
            SELECT sum(a.time) 'time'
            FROM attempt a 
            JOIN _event b ON a.event_id = b.id
            JOIN activity c ON b.activity_id = c.id
            WHERE c.patient_id = ? 
            AND DATE(a.created_at) BETWEEN ? AND ? 
            `, [patient_id, start_of_week, end_of_schedule.format('YYYY-MM-DD')]);
            achieved_time = achieved_time[0];
            if (!achieved_time.time) achieved_time.time = 0;
            achieved_time = achieved_time.time;

            var badge_type = 0;
            var ratio = 0;
            if (patient.custom_score_value != 0)
                ratio = 1. * achieved_time / patient.custom_score_value * 100.0;
            else if (target_time)
                ratio = 1. * achieved_time / target_time * 100.0;
            if (ratio >= 100) badge_type = 1;
            else if (ratio >= 50) badge_type = 2;
            else if (ratio >= 1) badge_type = 3;
            return {
                success: true,
                patient_id: patient_id,
                custom_score_value: patient.custom_score_value,
                target_time: target_time,
                achieved_time: achieved_time,
                ratio: ratio,
                badge_type: badge_type,
                badges_count: badges_count
            }
        } catch (error) {
            return {
                success: false,
                error: error.message ? error.message : error
            }
        }
    }

}
