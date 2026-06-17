var REPO_OWNER = "devansharora-stack";
var REPO_NAME = "daily-news-dump";
var BRANCH = "main";

var B2B_WEBHOOK_URL = PropertiesService.getScriptProperties().getProperty("B2B_GOOGLE_CHAT_WEBHOOK_URL");

function sendB2BResource() {
  var today = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
  var url = "https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/" + BRANCH + "/b2b-digests/" + today + ".json";

  var response;
  try {
    response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    Logger.log("Failed to fetch B2B digest: " + e.message);
    return;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log("No B2B digest found for " + today + " (HTTP " + response.getResponseCode() + ")");
    return;
  }

  var resource = JSON.parse(response.getContentText());
  if (!resource || !resource.headline) {
    Logger.log("B2B digest is empty for " + today);
    return;
  }

  var badgeText = resource.freshOrEvergreen === "fresh" ? "Fresh" : "From the Library";

  var cardMessage = {
    cardsV2: [
      {
        cardId: "b2b-" + today,
        card: {
          header: {
            title: "B2B Marketing Resource",
            subtitle: today + "  |  " + badgeText,
            imageUrl: "https://www.gstatic.com/images/branding/product/2x/google_trends_64dp.png",
            imageType: "CIRCLE",
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    icon: { knownIcon: "BOOKMARK" },
                    text: "<b>" + escapeHtml(resource.headline) + "</b>",
                    wrapText: true,
                    bottomLabel: resource.source,
                  },
                },
              ],
            },
            {
              header: "Top Take",
              widgets: [
                {
                  textParagraph: {
                    text: escapeHtml(resource.topTake),
                  },
                },
              ],
            },
            {
              widgets: [
                { divider: {} },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "Read full article",
                        onClick: {
                          openLink: { url: resource.url },
                        },
                      },
                    ],
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  textParagraph: {
                    text: '<font color="#999999">B2B Marketing Intelligence  ·  Daily resource via GitHub Actions + Claude</font>',
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(cardMessage),
    muteHttpExceptions: true,
  };

  var postResponse = UrlFetchApp.fetch(B2B_WEBHOOK_URL, options);
  Logger.log("Posted B2B resource to Google Chat: HTTP " + postResponse.getResponseCode());
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
