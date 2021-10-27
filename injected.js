/* PAUSE FOR NOW TO TEST CSV EXPORT
setInterval(() => {
  const dL = JSON.stringify(window.dataLayer);

  window.postMessage({
    type: "FROM_PAGE",
    dL: dL
  })
}, 2000);
*/


window.addEventListener('message', e => {
  if (e.data && e.data.action === "getDataLayer" && e.data.type === "FROM_CONTENT") {
    //copy dataLayer from page
    /*
    var dataLayerCopy = {};
    var dataLayer = window.tc_vars;
    for (const variable in dataLayer) {
      if (dataLayer[variable]) {
        dataLayerCopy[variable] = dataLayer[variable];
      }
    }
    */
    //send copy of dataLayer
    //console.log("dataLayer from injected.js: ", dataLayerCopy)

    var tc_vars = flattenObject(window.tc_vars, null, {});
    var digitalData = flattenObject(window.digitalData, null, {});
    var finalDataLayer = {...tc_vars, ...digitalData}
    console.log("flattened and merged dataLayer from injected.js: ", finalDataLayer);
    window.postMessage({
      type: "FROM_PAGE",
      dataLayer: finalDataLayer
    });
  }
});

/*
flattenObject recursively takes an object with an arbitrary depth 
and return an object with all properties grouped at the root level.
Useful to have reduce digitalData to the same level
Exemple:
const nestedObject = { a: { b: 1}, c: { d: { e: 3 }}}, f: [1,2,{ g: "lol"}]}
flattenObject(nestedObject, null, {})
{ b: 1, e: 3, f: [1,2], g: "lol"}
*/
function flattenObject(object, key, output) {
    // It's an object ? Recrusive call
    if (typeof object == "object" && !(object instanceof Array)) {
        try{
            Object.keys(object).forEach(property => flattenObject(object[property], property, output));
        } catch(e){
            console.warn(e);
        }
    // An array ? Recursive call !
    } else if (object instanceof Array) {
        object.forEach(value => flattenObject(value, key, output));
    // a primitive - (we don't handle Set, Map, ...) for now
    } else {
        if (output[key] != undefined) {
            if (output[key] instanceof Array) {
                output[key].push(object);
            } else {
                var temp = [];
                temp.push(output[key]);
                temp.push(object);
                output[key] = temp;
            }
        } else {
            output[key] = object;
        }
        return output;
    }
    return output;
}