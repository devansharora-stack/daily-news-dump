// Triggers the GitHub Actions workflows via the workflow_dispatch API.
// Use Apps Script time-based triggers instead of cron-job.org.
//
// SETUP:
// 1. Project Settings -> Script Properties -> add GH_TOKEN = your fine-grained
//    GitHub PAT (repo daily-news-dump, Actions: Read and write).
// 2. Triggers (clock icon) -> Add Trigger for each function below:
//      triggerAINewsDigest   -> Time-driven, Day timer, 9am-10am
//      triggerB2BDaily       -> Time-driven, Day timer, 9am-10am
//      triggerB2BWeeklyPlan  -> Time-driven, Week timer, Sunday, 7am-8am
//    (Apps Script day/week timers fire within the chosen hour window.)

var GH_OWNER = "devansharora-stack";
var GH_REPO = "daily-news-dump";
var GH_REF = "main";

function dispatchWorkflow_(workflowFile, inputs) {
  var token = PropertiesService.getScriptProperties().getProperty("GH_TOKEN");
  if (!token) {
    Logger.log("GH_TOKEN script property is not set");
    return;
  }

  var url = "https://api.github.com/repos/" + GH_OWNER + "/" + GH_REPO +
    "/actions/workflows/" + workflowFile + "/dispatches";

  var payload = { ref: GH_REF };
  if (inputs) payload.inputs = inputs;

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  // GitHub returns 204 No Content on success.
  Logger.log("Dispatched " + workflowFile + " -> HTTP " + res.getResponseCode() + " " + res.getContentText());
}

function triggerAINewsDigest() {
  dispatchWorkflow_("daily-digest.yml", null);
}

function triggerB2BDaily() {
  dispatchWorkflow_("b2b-digest.yml", { mode: "daily" });
}

function triggerB2BWeeklyPlan() {
  dispatchWorkflow_("b2b-digest.yml", { mode: "plan-week" });
}
