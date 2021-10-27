var backgroundPageConnection = chrome.runtime.connect({
    name: "devtools" + chrome.devtools.inspectedWindow.tabId
});

backgroundPageConnection.onMessage.addListener((message) => {
    // Handle responses from the background page, if any
    if(message.action === "getHAR"){
        chrome.devtools.network.getHAR((har) => {
            var filteredHar = {
                pages: har.pages,
                entries: []
            }
            // filter Hars
            har.entries
            .filter(entry => !/\.css|\.html|\.js|\.jpe?g|\.png|\.woff2|\.svg|\.pdf|\.docx?|\.php|\.json|data:/.test(entry.request.url))
            .filter(entry => entry._resourceType !== "preflight")
            .forEach(element => {
                filteredHar.entries.push({
                    "_resourceType": element._resourceType,
                    request: element.request
                })
            });
            //send filtered info
            backgroundPageConnection.postMessage({
                har: filteredHar, 
                type: "harFile",
                fileName: message.fileName,
                har_raw: har
            });
        });
    }
});