// Globals but not rellay, scoped to background.js 
let _requests = [];
let dLValues = [];
let tcVars = {};
let cookiesUsed = [];
let HAR = {};
let devTools = null;
let interceptedRequestsCounter = 0;
const networkFilters = {
    //urls: ["*://*.fnac.com/*"]
    urls: ["<all_urls>"]
};
const extraInfoSpecs = ["requestBody"];


let targetTabID = "";
let targetTabURL = "";
let rightDevtoolsConnected = false;

// dataLayerValues returns an array, concatenation of every dataLayer item values
const dataLayerValues = (dataLayer) => {
    return dataLayer.map(push => {
        delete push['gtm.uniqueEventId'];
        return Object.values(push);
    }).flat();
}

const checkURLagainstDataLayer = (request, dataLayer) => {
    let url = decodeURIComponent(request.url);
    let matches = [];
    for (const variable in dataLayer) {
        let pattern = new RegExp("\=" + dataLayer[variable] + "\&", "gi"); // HELP WITH REGEX ???
        let match = url.match(pattern);
        if (match && match[0]) {
            matches.push(variable + ": " + match[0].replace("=", "").replace("&", ""));
        }
    }
    if (matches.length) {
        return matches.join('|');
    } else {
        return "";
    }
}

const getCookies = (url) => {
    chrome.cookies.getAll({
        url: url
    }, (cookiesFound) => {
        if (cookiesFound.length) {
            //console.log("COOKIES for " + url, cookiesFound);
            //is cookie already logged?
            cookiesFound.forEach((cookieFound) => {
                let isDuplicate = false;
                cookiesUsed.forEach((cookieUsed) => {
                    if (cookieUsed.domain === cookieFound.domain &&
                        cookieUsed.name === cookieFound.name &&
                        cookieUsed.value === cookieFound.value) {
                        isDuplicate = true;
                    }
                })
                if (!isDuplicate) {
                    cookiesUsed.push(cookieFound);
                }
            });
        }
    });
}

const checkURLagainstCookies = (reqUrl) => {
    let url = decodeURIComponent(reqUrl);
    chrome.cookies.getAll({
        url: url
    }, (cookiesFound) => {
        if (cookiesFound.length) {
            let matches = [];
            cookiesFound.forEach((cookieFound) => {
                try {
                    let pattern = new RegExp("\=" + decodeURIComponent(cookieFound.value) + "\&", "gi"); // HELP WITH REGEX ???
                    let match = url.match(pattern);
                    if (match && match[0]) {
                        matches.push(cookieFound.name + ": " + match[0].replace("=", "").replace("&", ""));
                    }
                } catch {}
            });
            if (matches.length) {
                return matches.join('|');
            } 
        }
        return "";
    });
}

const getHAR = (fileName) => {
    devTools.postMessage({
        action: "getHAR",
        fileName: fileName
    });
};

const parseBody = (body) => {

    if (body.formData) {
        return body.formData;
    }

    if (body.raw && Array.isArray(body.raw)) {
        let parsedBody = "";
        let postedString = "";
        try {
            postedString = body.raw.map(function(data) {
                return String.fromCharCode.apply(null, new Uint8Array(data.bytes));
            }).join('');
            parsedBody = JSON.parse(postedString);
            console.log("request body parsed: ", parsedBody);
        } catch (error) {
            console.log("error retrieving body: ", error);
        } finally {
            return !!parsedBody ? parsedBody : postedString ? postedString : "";
        }
    }
    console.log("body type not handled: ", body);
    return "";
}

// requestsContainingDL returns a list of requests that contain values 
// oberved in the dataLayer
const requests = () => {
    let filterValues = dLValues.filter(val => val != ".");
    let pattern = new RegExp("(" + dLValues.join(')|(').replace(/(\.|\+|\?|\[|\]|\*)+/gi, '') + ")", "gi")

    const header = ["Origin URL", "Request URL", "DataLayer values observed", "Cookie values observed"];
    console.log("audit begin. current dataLayer:", tcVars);
    //getHAR();
    const allRequests =
        _requests
        // file extensions that should not be collected as part of the audit. 
        .filter(request => !/\.css|\.html|\.js|\.jpe?g|\.png|\.woff2|\.svg|\.pdf|\.docx?|\.php|\.json/.test(request.url))
        .map(request => {
            getCookies(request.url);
            return [
                targetTabURL,
                decodeURIComponent(request.url).replace(/,/g, "-"),
                //request.url.match(pattern).filter(e => !!e).length > 0 ? request.url.match(pattern).join(';') : ""
                checkURLagainstDataLayer(request, tcVars),
                checkURLagainstCookies(request.url)
            ]
        });

    // add headers. Caution, unshift is not a pure function
    allRequests.unshift(header);
    return allRequests;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    //console.log("tab onUpdated: ", tab);
    // restart audit
    if (/fnac\.com/gi.test(tab.url) && targetTabURL !== tab.url) {
        console.log("tab fnac! counters reseted");
        _requests = [];
        interceptedRequestsCounter = 0;
        targetTabID = tabId;
        targetTabURL = tab.url;
        console.log("New tabId: ", targetTabID);
    }
})


// onBeforeRequest  intercept requests that succeed
chrome.webRequest.onBeforeRequest.addListener(details => {
    if (details.tabId === targetTabID) {

        /* Makes the background crash in my tests, put it to sleep for now
        if (details.method === "POST") {
          // Use this to decode the body of your post
          details.parsedBody = parseBody(details.requestBody);
        }
        */


        //console.log("intercepted request: ", details);

        _requests.push(details);
        interceptedRequestsCounter++;

        // console.log("interceptedRequestsCounter: " + interceptedRequestsCounter);

        chrome.runtime.sendMessage({
            action: "reqCounter",
            counter: interceptedRequestsCounter
        });

    }
}, networkFilters, extraInfoSpecs);

// Get GTM dataLayer from the host page 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // export results to popup.js
    if (message && message.action == "getResults" && message.type === "FROM_POPUP") {
        const prefix = "httpminer_audit_";
        let pageTitle = "";
        const timestamp = new Date().getTime().toString();
        let fileName = "";
        console.log("popup asked for files!");
        //get datalayer from content-script
        chrome.tabs.query({
            url: "*://*.fnac.com/*"
        }, (tabs) => {
            console.log("tabs query result:", tabs);

            // TODO: for now, the audited site must be the first tab, otherwise the message won't be sent to the correct
            // tab. Look for a way to reference the corect tab id (maybe using sendResponse callback ?)
            pageTitle = tabs[0].title.replace(/[\/\\?%*:|"<>.]/g, "");
            fileName = prefix + pageTitle + "_" + timestamp;
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "getDataLayer",
                type: "FROM_BACK",
                fileName: fileName
            });
            getHAR(fileName);
        });
    }

    // message coming form content-script with dataLayer infos.
    if (message && message.dL) {
        try {
            //const dL = JSON.parse(message.dL);

            // store it in a global for later use
            //dLValues = dataLayerValues(dL);
            tcVars = JSON.parse(message.dL);
            console.log("dataLayer from")
        } catch (e) {
            console.log("Failed to parse JSON", e)
        } finally {
            //send results
            if (Object.keys(tcVars).length) {
                chrome.runtime.sendMessage({
                    action: "gotResults",
                    results: JSON.stringify(requests()),
                    type: "FROM_BACK"
                });
            }
        }
    }
    if(message && message.dataLayer) {
        chrome.runtime.sendMessage({
            action: "dataLayer",
            type: "FROM_BACK",
            dataLayer: message.dataLayer,
            fileName: message.fileName
        });
    }

    if(message && message.action === "isDevtoolsConnected"){
        chrome.runtime.sendMessage({
            action: "devtoolsConnection",
            isConnected: rightDevtoolsConnected
        });
    }
    //return true;  // Required to keep message port open
});

chrome.runtime.onConnect.addListener((devToolsConnection) => {
    console.log('connected to devtools page: ', devToolsConnection.name);
    // assign the listener function to a variable so we can remove it later

    if("devtools"+targetTabID === devToolsConnection.name){
        console.log("connected to the good devtools");
        var devToolsListener = (message, sender, sendResponse) => {
            if(message.type === "harFile"){
                //console.log("HAR: ", message.har);
                //HAR = message;
                chrome.runtime.sendMessage({
                    action: "HARFile",
                    type: "FROM_BACK",
                    har: message.har,
                    fileName: message.fileName,
                    har_raw: message.har_raw
                });
            }
        }
        rightDevtoolsConnected = true;
        devTools = devToolsConnection;
        chrome.runtime.sendMessage({
            action: "devtoolsConnection",
            isConnected: rightDevtoolsConnected
        });

        // add/remove the listener
        devToolsConnection.onMessage.addListener(devToolsListener);
        devToolsConnection.onDisconnect.addListener(function() {
            devToolsConnection.onMessage.removeListener(devToolsListener);
            rightDevtoolsConnected = false;
            chrome.runtime.sendMessage({
                action: "devtoolsConnection",
                isConnected: rightDevtoolsConnected
            });
        });
    }
});