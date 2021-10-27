//var counter = document.getElementById("reqCounter");
var buttonDownload = document.getElementById("csv");
var input = document.getElementById("action");
var devTools = document.getElementById("devtools");

const exportToCSV = (data) => {
    console.log(data);
    const csv = data
        /*  
          .split(",")
          */
        .map(row => row.join(','))
        .join('\n');
    var blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
    })

    // createObjectURL temporarily stores the data in browser and assigns it a local URL
    var fileHref = URL.createObjectURL(blob)
    // download
    chrome.downloads.download({
        url: fileHref,
        filename: `httpminer_audit_${+new Date()}.csv`
    });
}

//Updating the counter
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // export results to content-script
    if (message && message.action === "reqCounter") {
        sendResponse({
            action: "ok"
        });
        //counter.innerText = message.counter;
    }

    if(message.action === "devtoolsConnection"){
        if(message.isConnected){
            devTools.innerText = "Connected to devtools.";
            devTools.style.color = "blue";
        } 
        if(message.isConnected === false) {
            devTools.innerText = "Not connected to devtools.";
            devTools.style.color = "red";
        }
    }

    if (message && message.action === "gotResults" && message.type === "FROM_BACK") {
        exportToCSV(JSON.parse(message.results))
    }
    if (message && message.action === "HARFile" && message.type === "FROM_BACK") {
        // need message.har and message.fileName
        // adding action to har entries
        let action = input.value;
        if(action){
            message.har.entries.forEach(entry => entry.action = action);
            message.har_raw.entries.forEach(entry => entry.action = action);
        }

        //download filtered har
        let harStr = JSON.stringify(message.har);
        let harUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(harStr);
        chrome.downloads.download({
            url: harUri,
            filename: message.fileName + "_har" + (action ? "_"+action : "") + ".json"
        });

        //download raw har
        let harStr_raw = JSON.stringify(message.har_raw);
        let harUri_raw = 'data:application/json;charset=utf-8,'+ encodeURIComponent(harStr_raw);
        chrome.downloads.download({
            url: harUri_raw,
            filename: message.fileName + "_har_raw" + (action ? "_"+action : "") + ".json"
        });
        input.value = "";
    }
    if (message && message.action === "dataLayer" && message.type === "FROM_BACK") {
        // need message.dataLayer and message.fileName
        let action = input.value;
        let dataLayerStr = JSON.stringify(message.dataLayer);
        let dataLayerUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataLayerStr);
        chrome.downloads.download({
            url: dataLayerUri,
            filename: message.fileName + "_datalayer" + (action ? "_"+action : "") + ".json"
        });
    }
});

//Download button
buttonDownload.addEventListener("click", (ev) => {
    ev.preventDefault();
    chrome.runtime.sendMessage({
        type: "FROM_POPUP",
        action: "getResults"
    });
});

chrome.runtime.sendMessage({
    action: "isDevtoolsConnected"
});