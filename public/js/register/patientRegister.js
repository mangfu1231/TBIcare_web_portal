
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
    }
    else if(nStatus == Strophe.Status.REGISTERED)
    {
        document.getElementById("addPatientForm").submit();
        Swal.fire({
            icon: 'success',
            title: 'Registration is successful',
            showConfirmButton: false,
            timer: 2000
        }).then(function () {
                window.location = "addPatient";
            });
    }
    else if(nStatus == Strophe.Status.REGIFAIL)
    {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: "Registration failed. Please try again later",
          })
        document.getElementById("show").innerHTML = "Registration failed. Please try again later";
    }
    else if(nStatus == Strophe.Status.CONFLICT)
    {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: "Try some other username and password",
          })
        document.getElementById("show").innerHTML = "Try some other username and password";
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
    var username;
    var password;
    var poolData;
        
    username =  document.getElementById("username").value;	
    email = document.getElementById("email").value;
    
    if (document.getElementById("password").value != document.getElementById("confirmPassword").value) {
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Passwords Do Not Match!',
          })
        throw "Passwords Do Not Match!"
    } else {
        password =  document.getElementById("password").value;	
    }
    
    poolData = {
            UserPoolId : Patientconfig.cognito.userPoolId, // Your user pool id here
            ClientId : Patientconfig.cognito.clientId // Your client id here
        };		
    var userPoolPatient = new AmazonCognitoIdentity.CognitoUserPool(poolData);

    var attributeList = [];
    
    var dataEmail = {
        Name : 'email', 
        Value : email, //get from form field
    };
    
    var dataPersonalName = {
        Name : 'name', 
        Value : username, //get from form field
    };

    var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);
    var attributePersonalName = new AmazonCognitoIdentity.CognitoUserAttribute(dataPersonalName);
    
    
    attributeList.push(attributeEmail);
    attributeList.push(attributePersonalName);

    userPoolPatient.signUp(username, password, attributeList, null, function(err, result){
        if (err) {
            Swal.fire({
                icon: 'error',
                title: 'Oops...',
                text: err.message,
              })
            return;
        }
        cognitoUser = result.user;
        console.log('user name is ' + cognitoUser.getUsername());
        conn = new Strophe.Connection("http://54.82.188.133:7070/http-bind");
        conn.register.connect("54.82.188.133", onConnectionStatus, 60, 1);
    });
}