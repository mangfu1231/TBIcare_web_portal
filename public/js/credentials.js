var fs = require('fs');
var name = "check"
var password = "123"
var params = {jid: "check" , password: "123" };


writeJson(params)//执行一下;


function writeJson(params){
    //现将json文件读出来
    fs.readFile('./mock/myjson',function(err,data){
        if(err){
            return console.error(err);
        }

        var str = JSON.stringify(params);
        fs.writeFile('./mock/myjson',str,function(err){
            if(err){
                console.error(err);
            }
        })
    })
""}


