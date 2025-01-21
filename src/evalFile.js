let exportedFunctions = null;

function executeEval(codeString, functionName) {
  try {
    eval(codeString);
    if (typeof eval(functionName) === 'function') {
      exportedFunctions = eval(functionName);
      return true;
    } else {
      console.warn(`Function ${functionName} is not defined or not a function.`);
      return false;
    }
  } catch (error) {
    console.error("Error executing eval:", error);
    return false;
  }
}

function callEvalFunction(...args) {
  if (typeof exportedFunctions === 'function') {
    return exportedFunctions(...args);
  } else {
    return null;
  }
}

module.exports = {
  executeEval,
  callEvalFunction
};
