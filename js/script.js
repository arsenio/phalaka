(function(){
  var ASANA_CLIENT_ID = "85566523072252";
  var ASANA_REDIRECT_URI = "http://phalaka.local/callback";

  var projectId = document.location.hash.replace("#", "");

  // Handle initial authentication
  var auth_button = document.getElementById("authenticate");
  auth_button.addEventListener("click", function(e){
    e.preventDefault();
    document.getElementById("auth-button").style.display = "none";
    document.getElementById("auth-spinner").style.display = "inline-block";
    window.location.href = "https://app.asana.com/-/oauth_authorize"
                         + "?client_id=" + ASANA_CLIENT_ID
                         + "&redirect_uri=" + ASANA_REDIRECT_URI
                         + "&response_type=code"
                         + "&state=" + projectId;
  });

  // If we have an access_token and it's valid, we can hide the authentication
  // prompt and set up the canvas instead.
  var access_token = getCookie("access");
  var refresh_token = getCookie("refresh");
  if(access_token && refresh_token){
    document.getElementById("authenticate").style.display = "none";
    document.getElementById("board").style.display = "block";
    if(parseInt(projectId, 10)){
      getProjectDetails(projectId);
    }else{
      getWorkspaces();
    }
  }
  var username = getCookie("username");
  document.getElementById("auth-username").innerHTML = username;

  document.getElementById("workspaces").addEventListener("change", function(e){
    var workspaceId = e.target.value;
    if(workspaceId){
      getProjects(workspaceId);
    }
  });

  document.getElementById("projects").addEventListener("change", function(e){
    var projectId = e.target.value;
    if(projectId){
      getProjectDetails(projectId);
    }
  });

  // Asana API functions
  function getWorkspaces(){
    apiGet("/workspaces", function(response){
      if(response.data){
        var workspaceOptions = document.getElementById("workspaces");
        workspaceOptions.style.display = "none";
        var workspaces = workspaceOptions.children;
        for(var i=workspaces.length - 1; i>=0; i--){
          var workspace = workspaces[i];
          if(workspace.getAttribute("value") != 0){
            workspaces[i].remove();
          }
        }
        for(var i=0, x=response.data.length; i<x; i++){
          var datum = response.data[i];
          var workspace = document.createElement("option");
          workspace.setAttribute("value", datum.id);
          workspace.innerHTML = datum.name;
          workspaceOptions.appendChild(workspace);
        }
        workspaceOptions.style.display = "inline-block";
      }
    });
  }

  function getProjects(workspaceId){
    apiGet("/workspaces/" + workspaceId + "/projects", function(response){
      if(response.data){
        document.getElementById("workspaces").style.display = "none";
        var projectOptions = document.getElementById("projects");
        projectOptions.style.display = "none";
        var projects = projectOptions.children;
        for(var i=projects.length - 1; i>=0; i--){
          var project = projects[i];
          if(project.getAttribute("value") != 0){
            projects[i].remove();
          }
        }
        for(var i=0, x=response.data.length; i<x; i++){
          var datum = response.data[i];
          var project = document.createElement("option");
          project.setAttribute("value", datum.id);
          project.innerHTML = datum.name;
          projectOptions.appendChild(project);
        }
        projectOptions.style.display = "inline-block";
      }
    });
  }

  function getProjectDetails(projectId){
    apiGet("/projects/" + projectId, function(details){
      if(details.data){
        document.location.hash = projectId;
        document.getElementById("projects").style.display = "none";
        var projectName = document.getElementById("project-name");
        projectName.innerHTML = details.data.name;
        projectName.style.display = "inline-block";
        document.title = details.data.name + " - phalaka";

        var payload = {"opt_fields": "name,completed,assignee"};
        apiGet("/projects/" + projectId + "/tasks", payload, function(tasks){
          if(tasks.data){
            var canvas = document.getElementById("canvas");
            // Two passes will save us hitting the API twice for this.
            // Pass one: build the lanes.
            for(var i=0, x=tasks.data.length; i<x; i++){
              var task = tasks.data[i];
              if(task.name.endsWith(":")){
                var laneName = task.name.substring(0, task.name.length - 1);
                var lane = document.createElement("div");
                lane.setAttribute("id", "lane-" + task.id);
                lane.className = "lane";
                var marker = document.createElement("div");
                marker.className = "marker";
                marker.innerHTML = laneName;
                lane.appendChild(marker);
                canvas.appendChild(lane);
              }
            }
            // Pass two: add the uncompleted tasks to the lanes.
            var currentLane = undefined;
            for(var i=0, x=tasks.data.length; i<x; i++){
              var task = tasks.data[i];
              if(task.name.endsWith(":")){
                currentLane = document.getElementById("lane-" + task.id);
              }else if(currentLane){
                if(task.completed){
                  continue;
                }
                var ticket = document.createElement("div");
                ticket.setAttribute("id", "task-" + task.id);
                ticket.className = "task";
                ticket.innerHTML = task.name;
                currentLane.appendChild(ticket);
              }
            }
          }
        });
      }
    });
  }

  // Utility functions
  function getCookie(cookie_name){
    var raw_cookies = document.cookie.split("; ");

    for(var i=0, x=raw_cookies.length; i<x; i++){
      var cookie = raw_cookies[i].split("=");
      if(cookie[0] == cookie_name){
        return cookie[1];
      }
    }
    return undefined;
  }

  function setCookie(cookie_name, value){
    var expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    document.cookie = cookie_name + "=" + value
                    + ";path=/;expires=" + expiry.toUTCString();
  }

  function _xhrOnLoad(){
    if(this.status == 401){
      var reauth = false;
      try{
        var response = JSON.parse(this.response);
        if(response.errors){
          for(var i = 0, x = response.errors.length; i < x; i++){
            var message = response.errors[i].message;
            reauth = reauth || (message.includes("re-authenticate"));
          }
        }
        if(reauth){
          var origXhr = this;
          var xhr = new XMLHttpRequest()
          xhr.addEventListener("load", function(){
            access_token = getCookie("access");
            _api(origXhr.method, origXhr.endpoint,
                 origXhr.params, origXhr.handler);
          });
          xhr.open("GET", "/callback?refresh=" + refresh_token);
          xhr.send();
        }
      }catch(e){
console.log("Fatal error. -1");
      }
    }else{
      if(this.handler){
        try{
          document.getElementById("spinner").style.display = "none";
          this.handler(JSON.parse(this.responseText));
        }catch(e){
console.log("Fatal error. -2");
        }
      }
    }
  }
  function _api(method, endpoint, params, handler){
    document.getElementById("spinner").style.display = "block";
    var xhr = new XMLHttpRequest()
    xhr.method = method;
    xhr.endpoint = endpoint;
    xhr.params = params;
    xhr.handler = handler;
    xhr.addEventListener("load", _xhrOnLoad);
    xhr.open(method, "https://app.asana.com/api/1.0" + endpoint);
    xhr.setRequestHeader("Authorization", "Bearer " + access_token);
    xhr.send();
  }
  function apiGet(endpoint, params, handler){
    if(typeof(params) == "function"){
      handler = params;
      params = undefined;
    }
    if(params && typeof(params) == "object"){
      var qsStart = (endpoint.indexOf("?") >= 0) ? "&" : "?";
      var qsComponents = [];
      for(var key in params){
        if(params.hasOwnProperty(key)){
          qsComponents.push(encodeURIComponent(key) + "="
                            + encodeURIComponent(params[key]));
        }
      }
      endpoint += qsStart + qsComponents.join("&");
      params = undefined;
    }
    _api("GET", endpoint, params, handler);
  }
})();
