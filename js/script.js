(function(){
  var boardProjectId = "";
  var projects = {};
  var members = {};
  var tasks = [];
  var wips = {};

  getHash();

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
                         + "&state=" + document.location.hash.replace("#", "");
  });

  // If we have an access_token and it's valid, we can hide the authentication
  // prompt and set up the canvas instead.
  var access_token = getCookie("access");
  var refresh_token = getCookie("refresh");
  if(access_token && refresh_token){
    document.getElementById("authenticate").style.display = "none";
    document.getElementById("board").style.display = "block";
    if(parseInt(boardProjectId, 10)){
      getProjectDetails(boardProjectId);
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
        var options = workspaceOptions.children;
        for(var i=options.length - 1; i>=0; i--){
          var option = options[i];
          if(option.getAttribute("value") != 0){
            options[i].remove();
          }
        }
        for(var i=0, x=response.data.length; i<x; i++){
          var datum = response.data[i];
          var option = document.createElement("option");
          option.setAttribute("value", datum.id);
          option.innerHTML = datum.name;
          workspaceOptions.appendChild(option);
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
        var options = projectOptions.children;
        for(var i=options.length - 1; i>=0; i--){
          var option = options[i];
          if(option.getAttribute("value") != 0){
            options[i].remove();
          }
        }
        projects = {};
        for(var i=0, x=response.data.length; i<x; i++){
          var datum = response.data[i];
          var option = document.createElement("option");
          option.setAttribute("value", datum.id);
          option.innerHTML = datum.name;
          projectOptions.appendChild(option);
          projects[datum.id] = datum.name;
        }
        projectOptions.style.display = "inline-block";
      }
    });
  }

  function getProjectDetails(projectId){
    boardProjectId = projectId;
    var payload = {"opt_fields": "name,members,members.name"};
    apiGet("/projects/" + projectId, payload, function(details){
      if(details.data){
        setHash();
        document.getElementById("projects").style.display = "none";
        var projectName = document.getElementById("project-name");
        projectName.innerHTML = details.data.name;
        projectName.style.display = "inline-block";
        document.title = details.data.name;
        for(var i=0, x=details.data.members.length; i<x; i++){
          var member = details.data.members[i];
          members[member.id] = member.name;
        }
        var payload = {"opt_fields": "name,completed,assignee,assignee.name,assignee.photo"};
        tasks = [];
        apiGet("/projects/" + projectId + "/tasks", payload, function(tickets){
          if(tickets.data){
            tasks = tickets.data;
          }

          var canvas = document.getElementById("canvas");
          // Two passes will save us hitting the API twice for this.
          // Tasks Pass One: build the lanes (and pick up any missing
          // users not assigned to the project overall).
          for(var i=0, x=tasks.length; i<x; i++){
            var task = tasks[i];
            if(task.assignee){
              members[task.assignee.id] = task.assignee.name;
            }
            if(task.name.endsWith(":")){
              var laneName = task.name.substring(0, task.name.length - 1);
              var lane = document.createElement("div");
              lane.setAttribute("id", "lane-" + task.id);
              lane.className = "lane";
              var marker = document.createElement("div");
              marker.className = "marker";
              marker.innerHTML = laneName;
              var settings_button = document.createElement("div");
              settings_button.className = "settings-button";
              settings_button.addEventListener("click", toggleLaneSettings);
              marker.appendChild(settings_button);

              var cloneable = document.getElementById("settings-pane-cloneable");
              var pane = cloneable.cloneNode(true);
              var field = pane.querySelector("input[name=wip]");
              if(wips.hasOwnProperty(task.id)){
                field.value = wips[task.id];
              }else{
                field.value = "";
              }
              field.addEventListener("change", setWIPLimit);
              marker.appendChild(pane);

              lane.appendChild(marker);
              lane.addEventListener("drop", dragDrop);
              lane.addEventListener("dragover", dragOver);
              lane.addEventListener("dragleave", dragLeave);
              canvas.appendChild(lane);
            }
          }
          // This is a good time to carve out assignee rows.
          var sorted_members = [];
          for(var key in members){
            if(members.hasOwnProperty(key)){
              sorted_members.push([key, members[key]])
            }
          }
          sorted_members.sort(function(a, b){
            return a[1].toLowerCase() > b[1].toLowerCase();
          });

          // Tasks, Pass Two: add the uncompleted tasks to the lanes.
          var currentLane = undefined;
          for(var i=0, x=tasks.length; i<x; i++){
            var task = tasks[i];
console.log(task);
            if(task.name.endsWith(":")){
              currentLane = document.getElementById("lane-" + task.id);
            }else if(currentLane){
              if(task.completed){
                continue;
              }
              var ticket = document.createElement("div");
              ticket.setAttribute("id", "task-" + task.id);
              ticket.className = "task";
              ticket.setAttribute("draggable", "true");
              ticket.innerHTML = task.name;
              ticket.addEventListener("dragstart", dragStart);

              if(task.assignee && task.assignee.photo && task.assignee.photo.image_21x21){
                var photo = document.createElement("div");
                photo.className = "photo";
                photo.style.backgroundImage = "url(" + task.assignee.photo.image_21x21 + ")";
                photo.setAttribute("title", task.assignee.name);
                ticket.appendChild(photo);
              }

              currentLane.appendChild(ticket);
            }
          }
          checkWIPLimits();
        });
      }
    });
  }

  // Drag and drop functionality
  function dragStart(e) {
    e.dataTransfer.setData("text/plain", e.target.id);
  }

  function dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move"
    dropzoneShow(e);
  }

  function dragLeave(e) {
    e.preventDefault();
    dropzoneHide(e);
  }

  function dragDrop(e) {
    e.preventDefault();
    var data = e.dataTransfer.getData("text");
    var task = document.getElementById(data);

    var container = e.target;
    var payload = {"project": boardProjectId};
    if(container.className.indexOf("task") >= 0){
      payload["insert_before"] = container.id.replace("task-", "");
      container.parentNode.insertBefore(task, container);
    }else{
      var laneTasks = document.querySelectorAll("#" + container.id + " .task");
      if(laneTasks.length){
        var final = laneTasks[laneTasks.length - 1];
        payload["insert_after"] = final.id.replace("task-", "");
      }else{
        payload["section"] = container.id.replace("lane-", "");
      }
      container.appendChild(task);
    }
    checkWIPLimits();
    dropzoneHide(e);
    apiPost("/tasks/" + data.replace("task-", "") + "/addProject", payload);
  }

  function dropzoneShow(e) {
    if(!e.target.className || e.target.id == e.dataTransfer.getData("text")){
      return;
    }
    var container = e.target;
    if(!container.className){
      return;
    }
    if(container.className && container.className.indexOf("task") >= 0){
      container = container.parentNode;
    }
    if(container.className && container.className.indexOf("lane") >= 0){
      if(container.className.indexOf("drop") == -1){
        container.className = container.className + " drop";
      }
    }
  }

  function dropzoneHide(e) {
    if(e.target.id == e.dataTransfer.getData("text")){
      return;
    }
    var container = e.target;
    if(!container.className){
      return;
    }
    if(container.className && container.className.indexOf("task") >= 0){
      container = container.parentNode;
    }
    if(container.className && container.className.indexOf("lane") >= 0){
      container.className = container.className.replace(" drop", "");
    }
  }

  // WIP limit functionality
  function toggleLaneSettings(e){
    e.preventDefault();
    var marker = e.target.parentNode;
    var pane = marker.querySelector(".settings-pane");
    var lane = marker.parentNode;
    pane.style.display = (pane.style.display == "inline-block") ? "none": "inline-block";
    if(pane.style.display == "inline-block"){
      var field = pane.querySelector("input[name=wip]");
      field.focus();
    }
  }
  function setWIPLimit(e){
    var field = e.target;
    var lane = field.closest(".lane");
    var laneId = lane.getAttribute("id").replace("lane-", "")
    var limit = parseInt(e.target.value, 10);
    if(!Number.isInteger(limit)){
      limit = 0;
    }
    wips[laneId] = limit;
    field.value = limit;
    setHash();
    checkWIPLimits();
  }
  function checkWIPLimits(){
    var lanes = document.querySelectorAll("#canvas .lane");
    for(var i=0, x=lanes.length; i<x; i++){
      var lane = lanes[i];
      var laneId = lane.getAttribute("id").replace("lane-", "")
      var exceeded = false;
      if(wips.hasOwnProperty(laneId)){
        var limit = wips[laneId];
        var taskCount = lane.querySelectorAll(".task").length;
        exceeded = (taskCount > limit);
      }
      lane.className = lane.className.replace(" wip", "");
      if(exceeded){
        lane.className = lane.className + " wip";
      }
    }
  }

  // Hash handling
  function getHash(){
    var hash = document.location.hash.replace("#", "");
    if(hash.length){
      var hash_parts = hash.split(";");
      boardProjectId = hash_parts[0];
      if(hash_parts.length == 2){
        var hash_limits = hash_parts[1].split(",");
        for(var i=0, x=hash_limits.length; i<x; i++){
          var hash_limit = hash_limits[i];
          var hash_limit_parts = hash_limit.split(":");
          if(hash_limit_parts.length == 2){
            wips[hash_limit_parts[0]] = parseInt(hash_limit_parts[1], 10);
          }
        }
      }
    }
  }
  function setHash(){
    var limit_strings = [];
    for(var key in wips){
      if(wips.hasOwnProperty(key)){
        limit_strings.push(key + ":" + wips[key]);
      }
    }
    var new_hash = boardProjectId;
    if(limit_strings.length){
      new_hash += ";" + limit_strings.sort().join(",");
    }
    document.location.hash = new_hash;
  }
  window.addEventListener("hashchange", function(e){
    var oldProjectId = boardProjectId;
    getHash();
    if(boardProjectId != oldProjectId){
      getProjectDetails(boardProjectId);
    }else{
      checkWIPLimits();
    }
  });

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
// TODO: better fatal error visualization
console.log("Fatal error. -1");
      }
    }else{
      document.getElementById("spinner").style.display = "none";
      if(this.handler){
        try{
          this.handler(JSON.parse(this.responseText));
          delete this.responseText;
        }catch(e){
// TODO: better fatal error visualization
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
    var formData = undefined;
    if(params){
      formData = new FormData();
      for(var key in params){
        if(params.hasOwnProperty(key)){
          formData.append(key, params[key]);
        }
      }
    }
    xhr.send(formData);
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
  function apiPost(endpoint, params, handler){
    if(typeof(params) == "function"){
      handler = params;
      params = undefined;
    }
    _api("POST", endpoint, params, handler);
  }
})();
