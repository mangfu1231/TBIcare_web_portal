
var conn = null;

function onConnectionStatus(nStatus)
{
    if(nStatus == Strophe.Status.ERROR)
    {
        alert("Unknown error occured");
    }
    else if(nStatus == Strophe.Status.REGISTER)
    {
        conn.register.fields.username = document.getElementById("username").value;
        conn.register.fields.password = document.getElementById("password").value;
        conn.register.submit();
        document.getElementById("registerForm").submit();
    }
    // else if(nStatus == Strophe.Status.REGISTERED)
    // {
    //     Swal.fire({
    //         icon: 'success',
    //         title: 'Chat Account Update is successful',
    //         showConfirmButton: false,
    //         timer: 2000
    //     }).then(function () {
    //         document.getElementById("registerForm").submit();
    //     });
    // }
    else if(nStatus == Strophe.Status.REGIFAIL)
    {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: "Registration failed. Please try again later",
          })
        document.getElementById("show").innerHTML = "Registration failed. Please try again later";
        $("#show").toggle();
    }
    else if(nStatus == Strophe.Status.CONFLICT)
    {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: "Try some other username and password",
          })
    }
    else if(nStatus == Strophe.Status.NOTACCEPTABLE)
    {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: "Try some other username and password",
          })
        document.getElementById("show").innerHTML = "Try some other username and password";
    }
    
}

function register()
{

// aws cognito register
    // var username;
    // var password;
    // var poolData;
        
    // username =  document.getElementById("username").value;	
    // email = document.getElementById("email").value;
    
    // if (document.getElementById("password").value != document.getElementById("confirmPassword").value) {
    //     Swal.fire({
    //         icon: 'error',
    //         title: 'Oops...',
    //         text: 'Passwords Do Not Match!',
    //       })
    //     document.getElementById("show").innerHTML = "Passwords Do Not Match!";
    //     $("#show").toggle();
    //     throw "Passwords Do Not Match!"
    // } else {
    //     password =  document.getElementById("password").value;	
    // }
    
    // poolData = {
    //         UserPoolId : _config.cognito.userPoolId, // Your user pool id here
    //         ClientId : _config.cognito.clientId // Your client id here
    //     };		
    // var userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

    // var attributeList = [];
    
    // var dataEmail = {
    //     Name : 'email', 
    //     Value : email, //get from form field
    // };
    
    // var dataPersonalName = {
    //     Name : 'name', 
    //     Value : username, //get from form field
    // };

    // var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);
    // var attributePersonalName = new AmazonCognitoIdentity.CognitoUserAttribute(dataPersonalName);
    
    
    // attributeList.push(attributeEmail);
    // attributeList.push(attributePersonalName);

    // userPool.signUp(username, password, attributeList, null, function(err, result){
    //     if (err) {
    //         Swal.fire({
    //             icon: 'error',
    //             title: 'Oops...',
    //             text: err.message,
    //           })
    //         // alert(JSON.stringify(err));
    //         return;
    //     }
    //     cognitoUser = result.user;
    //     console.log('user name is ' + cognitoUser.getUsername());
        conn = new Strophe.Connection("https://utswtbi.com/http-bind/");
        conn.register.connect("utswtbi.com", onConnectionStatus, 60, 1);
    // });
}