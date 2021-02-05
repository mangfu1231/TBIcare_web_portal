function onConnectionStatus(nStatus)
{
    if(nStatus == Strophe.Status.ERROR)
    {
        alert("An error occured");
    }
    else if(nStatus == Strophe.Status.CONNECTED)
    {   
        localStorage.setItem("username", document.getElementById("username").value);
        localStorage.setItem("password", document.getElementById("password").value);
        document.getElementById("myForm").submit();
    }
    else if(nStatus == Strophe.Status.AUTHFAIL)
    {

        alert("An fail occured");
    }
}
function login()
{
    // if(document.getElementById("username").value == "" || document.getElementById("password").value == "")
    // {
    //     $("#show").toggle();
    // }
    // console.log(document.getElementById("username").value)
    // console.log(document.getElementById("password").value)

    conn = new Strophe.Connection("https://utswtbi.com/http-bind/");
    conn.connect(document.getElementById("username").value + "@54.82.188.133", document.getElementById("password").value, onConnectionStatus);
    localStorage.setItem("username", document.getElementById("username").value);
    localStorage.setItem("password", document.getElementById("password").value);
    document.getElementById("myForm").submit();
}

