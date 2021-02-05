var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cookieSession = require("cookie-session");
var favicon = require('serve-favicon');
// var emitter = require('events');
var helmet = require('helmet');
var config = require('./config/config');
var websiteRoutes = require('./routes/website');
var usersRouter = require('./routes/users');
var apiRoutes = require('./routes/api');
var scheduledRoutes = require('./routes/scheduled');
var jobsRoutes = require('./routes/jobs');


var app = express();


// app.use(function(req, res, next) {
//     res.header("Access-Control-Allow-Origin", "*");
//     res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
//     res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
//     next();
// });


app.all('/', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  next();
 });


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');






app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  cookieSession({
    name: "my-session",
    keys: ["somesecretkeythrowninhere"],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  })
);
app.use(express.static(path.join(__dirname, 'public')));
app.use("/vendor",express.static(__dirname + "/vendor"));
app.use("/assets",express.static(__dirname + "/assets"));
app.use("/public",express.static(__dirname + "/public"));
app.use("/node_modules",express.static(__dirname + "/node_modules"));
app.use(helmet());

// routes
app.use('/users', usersRouter);
app.use('/api', apiRoutes);
app.use('/website', websiteRoutes);
app.use('/scheduled', scheduledRoutes);
app.use('/jobs', jobsRoutes);
app.get('/', function (req, res, next) {
  res.redirect('/website');
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// emitter.EventEmitter.defaultMaxListeners = 20;

app.listen(3030, function(){
  console.log("runing on 3030");
});



module.exports = app;
