(function(){
  var boardProjectId = "";
  var backlog = "";
  var projects = {};
  var members = {};
  var tasks = [];
  var wips = {};
  var swimlanes = false;

  var BACKLOG_NONE = -1;
  var BACKLOG_NO_SECTION = -2;

  var locale = getLocale();

  getHash();

  // Fill in the backlog options
  var backlogOptions = document.getElementById("backlog");
  var optionNone = document.createElement("option");
  optionNone.setAttribute("value", BACKLOG_NONE);
  if(backlog == BACKLOG_NONE){
    optionNone.setAttribute("selected", "selected");
  }
  optionNone.innerHTML = "No backlog shown";
  backlogOptions.appendChild(optionNone);
  var optionNoSection = document.createElement("option");
  optionNoSection.setAttribute("value", BACKLOG_NO_SECTION);
  if(backlog == BACKLOG_NO_SECTION){
    optionNoSection.setAttribute("selected", "selected");
  }
  optionNoSection.innerHTML = "All tasks without a section";
  backlogOptions.appendChild(optionNoSection);


  // Handle initial authentication
  var authButton = document.getElementById("authenticate");
  authButton.addEventListener("click", function(e){
    e.preventDefault();
    document.getElementById("auth-button").style.display = "none";
    document.getElementById("auth-spinner").style.display = "inline-block";
    window.location.href = "https://app.asana.com/-/oauth_authorize"
                         + "?client_id=" + ASANA_CLIENT_ID
                         + "&redirect_uri=" + ASANA_REDIRECT_URI
                         + "&response_type=code"
                         + "&state=" + document.location.hash.replace("#", "");
  });

  // If we have an accessToken and it's valid, we can hide the authentication
  // prompt and set up the canvas instead.
  var accessToken = getCookie("access");
  var refreshToken = getCookie("refresh");
  if(accessToken && refreshToken){
    document.getElementById("authenticate").style.display = "none";
    document.getElementById("board").style.display = "block";
    if(parseInt(boardProjectId, 10)){
      getProjectDetails(boardProjectId);
    }else{
      getWorkspaces();
    }
  }
  var username = getCookie("username");
  var accountElement = document.getElementById("auth-username");
  accountElement.innerHTML = username;
  accountElement.addEventListener("click", function(e){
    e.preventDefault();
    deleteAllCookies();
    window.location.reload();
  });


  document.getElementById("backlog").addEventListener("change", function(e){
    backlog = e.target.value;
    setHash();
    window.location.reload();
  });

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
        projectName.querySelector("span").innerHTML = details.data.name;
        projectName.querySelector(".settings-button").addEventListener("click", toggleProjectSettings);
        projectName.style.display = "inline-block";
        var field = projectName.querySelector("#project-settings-pane input[name=swimlanes]");
        if(swimlanes){
          field.setAttribute("checked", "checked");
        }
        field.addEventListener("change", setSwimlane);
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

          renderProject();
        });
      }
    });
  }

  function renderLane(id, name, parent){
    var marker = document.createElement("th");
    marker.className = "marker";
    marker.setAttribute("id", "lane-" + id);
    marker.setAttribute("data-lane_id", id);
    marker.innerHTML = name;

    if(id > 0){
      var settingsButton = document.createElement("div");
      settingsButton.className = "settings-button";
      settingsButton.addEventListener("click", toggleLaneSettings);
      marker.appendChild(settingsButton);

      var cloneable = document.getElementById("settings-pane-cloneable");
      var pane = cloneable.cloneNode(true);
      var field = pane.querySelector("input[name=wip]");
      if(wips.hasOwnProperty(id)){
        field.value = wips[id];
      }else{
        field.value = "";
      }
      field.addEventListener("change", setWIPLimit);
      marker.appendChild(pane);
    }

    parent.appendChild(marker);
  }

  function renderProject(){
    var canvas = document.getElementById("canvas");
    var tableHead = canvas.querySelector("thead tr");
    var tableBody = canvas.querySelector("tbody");

    var spacer = document.createElement("th");
    spacer.className = "assignee";
    tableHead.appendChild(spacer);

    // Two task passes will save us hitting the API twice for this.
    // Tasks Pass One: build the lanes (and pick up any missing
    // users not assigned to the project overall).
    if(backlog == BACKLOG_NO_SECTION){
      renderLane(BACKLOG_NO_SECTION, "Backlog", tableHead);
    }
    for(var i=0, x=tasks.length; i<x; i++){
      var task = tasks[i];
      if(task.completed){
        continue;
      }
      if(task.assignee){
        members[task.assignee.id] = task.assignee.name;
      }
      if(task.name.endsWith(":")){
        renderLane(task.id, task.name.substring(0, task.name.length - 1), tableHead);
      }
    }

    // We'll set up the needed grid of table rows and cells, based on
    // assignees (or one catchall if swimlanes are disabled).
    var sortedMembers = [];
    for(var key in members){
      if(members.hasOwnProperty(key)){
        sortedMembers.push([key, members[key]])
      }
    }
    sortedMembers.sort(function(a, b){
      return a[1].toLowerCase() > b[1].toLowerCase();
    });
    sortedMembers.unshift([0, (swimlanes ? "Unassigned" : "")]);
    var lanes = canvas.querySelectorAll("th.marker");
    for(var i = 0, x=(swimlanes ? sortedMembers.length : 1); i<x; i++){
      var member = sortedMembers[i];
      var memberId = member[0];
      var memberName = member[1];
      var row = document.createElement("tr");
      var rowStart = document.createElement("td");
      rowStart.className = "assignee";
      rowStart.innerHTML = memberName.replace(" ", "<br/>");
      row.appendChild(rowStart);
      for(var j = 0, y=lanes.length; j<y; j++){
        var laneId = lanes[j].getAttribute("data-lane_id");
        var cell = document.createElement("td");
        var cellId = "dropzone-" + laneId;
        if(memberId){
          cellId += "-" + memberId;
        }
        cell.setAttribute("id", cellId);
        cell.setAttribute("data-lane_id", laneId);
        cell.setAttribute("data-assignee_id", (memberId || "null"));
        cell.className = "dropzone";
        cell.addEventListener("drop", dragDrop);
        cell.addEventListener("dragover", dragOver);
        cell.addEventListener("dragleave", dragLeave);
        row.appendChild(cell);
      }
      tableBody.appendChild(row);
    }

    // Tasks, Pass Two: add the uncompleted tasks to the lanes.
    var currentLaneId = backlog;
    for(var i=0, x=tasks.length; i<x; i++){
      var task = tasks[i];
      if(task.name.endsWith(":")){
        currentLaneId = task.id;
      }else if(currentLaneId > 0 || backlog == BACKLOG_NO_SECTION){
        if(task.completed){
          continue;
        }
        var dropzoneId = "dropzone-" + currentLaneId;
        if(swimlanes && task.assignee && task.assignee.id){
          dropzoneId += "-" + task.assignee.id;
        }
        var dropzone = document.getElementById(dropzoneId);
        var ticket = document.createElement("div");
        ticket.setAttribute("id", "task-" + task.id);
        ticket.className = "task";
        ticket.setAttribute("data-task_id", task.id);
        ticket.setAttribute("draggable", "true");
        ticket.innerHTML = htmlSafe(task.name);
        ticket.addEventListener("dragstart", dragStart);
        ticket.addEventListener("dblclick", revealTaskDetail);

        dropzone.appendChild(ticket);
      }
    }
    checkWIPLimits();
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
    var taskId = task.getAttribute("data-task_id");

    var container = e.target;
    var payload = {"project": boardProjectId};
    if(container.className.indexOf("task") >= 0){
      payload["insert_before"] = container.getAttribute("data-task_id");
      container.closest(".dropzone").insertBefore(task, container);
    }else{
      var laneTasks = document.querySelectorAll("#" + container.id + " .task");
      if(laneTasks.length){
        var final = laneTasks[laneTasks.length - 1];
        payload["insert_after"] = final.getAttribute("data-task_id");
      }else{
        var laneId = container.getAttribute("data-lane_id");
        if(laneId > 0){
          payload["section"] = container.getAttribute("data-lane_id");
        }else{
          payload["insert_after"] = null;
        }
      }
      container.appendChild(task);
    }
    checkWIPLimits();
    dropzoneHide(e);
    apiPost("/tasks/" + taskId + "/addProject", payload, function(e){
      if(swimlanes){
        var targetAssigneeId = container.getAttribute("data-assignee_id") || "null";
        for(var i=0, x=tasks.length; i<x; i++){
          var storedTask = tasks[i];
          if(storedTask.id == taskId){
            var sourceAssigneeId = (storedTask.assignee && storedTask.assignee.id) ? storedTask.assignee.id : "null";
            if(sourceAssigneeId != targetAssigneeId){
              storedTask.assignee = {"id": targetAssigneeId, "name": members[targetAssigneeId]};
              apiPut("/tasks/" + taskId, {"assignee": targetAssigneeId});
            }
          }
        }
      }
    });
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
      container = container.closest(".dropzone");
    }
    if(container.className && container.className.indexOf("dropzone") >= 0){
      if(container.className.indexOf("active") == -1){
        container.className = container.className + " active";
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
      container = container.closest(".dropzone");
    }
    if(container.className && container.className.indexOf("dropzone") >= 0){
      container.className = container.className.replace(" active", "");
    }
  }

  // Task detail functionality
  document.getElementById("task-complete").addEventListener("click", function(e){
    var taskDetail = document.getElementById("task-detail");
    var taskId = taskDetail.getAttribute("data-task_id");
    document.getElementById("detail-spinner").style.display = "block";
    apiPut("/tasks/" + taskId, {"completed": true}, function(e){
      closeTaskDetail(e);
      var ticket = document.getElementById("task-" + taskId);
      ticket.parentNode.removeChild(ticket);
    });
  });

  document.getElementById("task-close").addEventListener("click", closeTaskDetail);

  function closeTaskDetail(e){
    var taskDetail = document.getElementById("task-detail");
    taskDetail.setAttribute("data-task_id", "");
    taskDetail.className = "slide-close";
  }

  function revealTaskDetail(e){
    e.preventDefault();
    var ticket = e.target;
    var ticketId = e.target.getAttribute("data-task_id");
    if(!ticketId){
      return;
    }
    var ticketName = "";
    for(var i=0, x=tasks.length; i<x; i++){
      var task = tasks[i];
      if(task.id == ticketId){
        ticketName = task.name;
        break;
      }
    }

    var detailSpinner = document.getElementById("detail-spinner");
    detailSpinner.style.display = "block";

    var taskDetail = document.getElementById("task-detail");
    taskDetail.setAttribute("data-task_id", ticketId);
    taskDetail.querySelector(".title").innerHTML = ticketName;
    if(taskDetail.className.indexOf("slide-open") < 0){
      taskDetail.className = "slide-open";
    }

    var notes = taskDetail.querySelector(".notes");
    notes.innerHTML = "";

    var comments = taskDetail.querySelectorAll(".story");
    for(var i=comments.length - 1; i>=0; i--){
      taskDetail.removeChild(comments[i]);
    }

    var payload = {"opt_fields": "name,notes,created_by,created_by.name,html_text"};
    apiGet("/tasks/" + ticketId, payload, function(details){
      if(details.data){
        notes.innerHTML = addLinks(details.data.notes);
      }

      var params = {"opt_fields": "type,created_at,created_by,created_by.name,html_text"};
      apiGet("/tasks/" + ticketId + "/stories", params, function(stories){
        detailSpinner.style.display = "none";
        if(stories.data){
          for(var i=0, x=stories.data.length; i<x; i++){
            var story = stories.data[i];

            var comment = document.createElement("div");
            var style = "story";
            if(story.type == "comment"){
              style += " comment";
            }
            comment.className = style;

            var author = document.createElement("span");
            author.className = "creator";
            author.innerHTML = story.created_by.name;

            var text = document.createElement("span");
            text.className = "text";
            text.innerHTML = story.html_text;

            var timestamp = document.createElement("span");
            timestamp.className = "timestamp";
            var storyDateObj = new Date(story.created_at);
            var dateString = getDateString(storyDateObj);
            var timeString = getTimeString(storyDateObj);
            if(story.type == "comment"){
              timestamp.innerHTML = dateString + " at " + timeString;
            }else{
              timestamp.innerHTML = dateString;
              timestamp.setAttribute("title", dateString + " at " + timeString);
            }

            comment.appendChild(author);
            if(story.type == "comment"){
              comment.appendChild(timestamp);
              comment.appendChild(text);
            }else{
              comment.appendChild(text);
              comment.appendChild(timestamp);
            }
            taskDetail.appendChild(comment);
          }
        }
      });
    });
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
    var marker = field.closest(".marker");
    var laneId = marker.getAttribute("data-lane_id");
    var limit = parseInt(e.target.value, 10);
    if(!Number.isInteger(limit)){
      limit = 0;
    }
    if(limit){
      wips[laneId] = limit;
      field.value = limit;
    }else{
      delete wips[laneId];
      field.value = "";
    }
    setHash();
    checkWIPLimits();
  }
  function checkWIPLimits(){
    var dropzones = document.querySelectorAll("#canvas .dropzone");
    for(var i=0, x=dropzones.length; i<x; i++){
      var dropzone = dropzones[i];
      dropzone.className = dropzone.className.replace("wip", "");
      var laneId = dropzone.getAttribute("data-lane_id");
      if(wips.hasOwnProperty(laneId)){
        var limit = wips[laneId];
        var exceeded = false;
        var taskCount = dropzone.querySelectorAll(".task").length;
        exceeded = (taskCount > limit);
        if(exceeded){
          dropzone.className = dropzone.className + " wip";
        }
      }
    }
  }

  // Swimlane functionality
  function toggleProjectSettings(e){
    e.preventDefault();
    var pane = document.getElementById("project-settings-pane");
    pane.style.display = (pane.style.display == "inline-block") ? "none": "inline-block";
  }
  function setSwimlane(e){
    swimlanes = e.target.checked;
    setHash();
    window.location.reload();
  }

  // Hash handling
  function getHash(){
    var hash = document.location.hash.replace("#", "");
    if(hash.length){
      var hashWords = hash.split("+");
      var firstHashWord = hashWords[0];
      if(hashWords.length == 2){
        backlog = hashWords[1];
      }
      var hashParts = firstHashWord.split(";");
      boardProjectId = hashParts[0];
      if(boardProjectId.startsWith("!")){
        swimlanes = true;
        boardProjectId = boardProjectId.substring(1);
      }
      if(hashParts.length == 2){
        var hashLimits = hashParts[1].split(",");
        for(var i=0, x=hashLimits.length; i<x; i++){
          var hashLimit = hashLimits[i];
          var hashLimitParts = hashLimit.split(":");
          if(hashLimitParts.length == 2){
            wips[hashLimitParts[0]] = parseInt(hashLimitParts[1], 10);
          }
        }
      }
    }
  }
  function setHash(){
    var limitStrings = [];
    for(var key in wips){
      if(wips.hasOwnProperty(key)){
        limitStrings.push(key + ":" + wips[key]);
      }
    }
    var newHash = (swimlanes ? "!" : "") + boardProjectId;
    if(limitStrings.length){
      newHash += ";" + limitStrings.sort().join(",");
    }
    if(backlog){
      newHash += "+" + backlog;
    }
    document.location.hash = newHash;
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
  function addLinks(text){
    var urlRegex =/(\bhttps?:\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function(url) {
        return "<a target=\"_blank\" href=\"" + url + "\">" + url + "</a>";
    });
  }

  function htmlSafe(text){
    text = text.replace(/</g, '&lt;');
    text = text.replace(/>/g, '&gt;');
    return text;
  }

  function getLocale(){
    return navigator.languages || navigator.userLanguage || navigator.language;
  }

  function getDateString(dateObj){
    var ref = new Date();
    if(dateObj.getMonth() == ref.getMonth() &&
       dateObj.getDate() == ref.getDate() &&
       dateObj.getFullYear() == ref.getFullYear()){
      return "Today";
    }

    ref.setDate(ref.getDate() - 1);
    if(dateObj.getMonth() == ref.getMonth() &&
       dateObj.getDate() == ref.getDate() &&
       dateObj.getFullYear() == ref.getFullYear()){
      return "Yesterday";
    }

    var options = {"year": "numeric", "month": "short", "day": "numeric"};
    return dateObj.toLocaleDateString(locale, options);
  };

  function getTimeString(dateObj){
    var options = {"hour12": true, "hours": "2-digit", "seconds": "2-digit"}
    return dateObj.toLocaleTimeString(locale, options);
  };

  // Cookie functions
  function getCookie(cookieName){
    var rawCookies = document.cookie.split("; ");

    for(var i=0, x=rawCookies.length; i<x; i++){
      var cookie = rawCookies[i].split("=");
      if(cookie[0] == cookieName){
        return cookie[1];
      }
    }
    return undefined;
  }

  function setCookie(cookieName, value){
    var expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    document.cookie = cookieName + "=" + value
                    + ";path=/;expires=" + expiry.toUTCString();
  }

  function deleteAllCookies(){
    var cookies = document.cookie.split(";");
    for(var i = 0, x=cookies.length; i<x; i++){
      var cookie = cookies[i];
      var eqPos = cookie.indexOf("=");
      var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  }

  // API functions
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
            accessToken = getCookie("access");
            _api(origXhr.method, origXhr.endpoint,
                 origXhr.params, origXhr.handler);
          });
          xhr.open("GET", "/callback?refresh=" + refreshToken);
          xhr.send();
        }
      }catch(e){
// TODO: better fatal error visualization
console.log("Fatal error: -1");
      }
    }else{
      document.getElementById("spinner").style.display = "none";
      if(this.handler){
        try{
          this.handler(JSON.parse(this.responseText));
          delete this.responseText;
        }catch(e){
// TODO: better fatal error visualization
console.log("Fatal error: -2 (" + e);
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
    xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
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
  function apiPut(endpoint, params, handler){
    if(typeof(params) == "function"){
      handler = params;
      params = undefined;
    }
    _api("PUT", endpoint, params, handler);
  }
})();
