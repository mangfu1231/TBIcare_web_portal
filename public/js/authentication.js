window.addEventListener("load", function(){
    if(localStorage.getItem("username") == undefined || localStorage.getItem("password") == undefined || localStorage.getItem("username") == null || localStorage.getItem("password") == null)
    {   
        console.log('undiefined');
        window.location = "/website/login";
    }
}, false);

function logout()
{   
    localStorage.removeItem("username");
    localStorage.removeItem("password");
    window.location = "/website/login";
}

var conn = null;

// window.addEventListener("load", function(){
//     console.log('i am load');
//     conn = new Strophe.Connection("http://3.12.144.23:7070/http-bind");
//     console.log(this.localStorage);
//     console.log(localStorage.getItem("username")+ "@3.12.144.23");
//     console.log(localStorage.getItem("password"));
//     conn.connect(localStorage.getItem("username") + "@3.12.144.23", localStorage.getItem("password"), OnConnectionStatus);
// }, false);

// function OnConnectionStatus(nStatus)
// {
//     if (nStatus == Strophe.Status.ERROR) 
//     {
//         alert("Unknown Error Occured");
//     }
//     else if (nStatus == Strophe.Status.CONNECTED) 
//     {
//         connected();
//     }
//     else if (nStatus == Strophe.Status.AUTHFAIL) 
//     {
//         alert("Authentication Failure. Please check username and password");
//         window.location = "login";
//     }
//     else if (nStatus == Strophe.Status.DISCONNECTED) 
//     {    
//         console.log('I am DISCONNECTED');

//         var timer = setInterval(function(){
//             if(conn.connected == false)
//             {
//                 conn.connect(conn.jid, conn.pass, function(nStatus){
//                     if (nStatus == Strophe.Status.CONNECTED) 
//                     {
//                         conn.send($pres());
//                     }
//                 });
//             }
//             else
//             {
//                 clearInterval(timer);
//             }
//         }, 3000);
//     }
// }

// //register handlers
// function connected()
// {
//     console.log('I am online');
//     //send your status to all other users.
//     conn.send($pres()); 
    

// }



