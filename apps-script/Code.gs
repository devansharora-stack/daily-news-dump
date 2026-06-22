var REPO_OWNER = "devansharora-stack";
var REPO_NAME = "daily-news-dump";
var BRANCH = "main";

var WEBHOOK_URL = PropertiesService.getScriptProperties().getProperty("GOOGLE_CHAT_WEBHOOK_URL");

function sendDailyDigest() {
  var today = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
  var url = "https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/" + BRANCH + "/digests/" + today + ".json";

  var response;
  try {
    response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    Logger.log("Failed to fetch digest: " + e.message);
    return;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log("No digest found for " + today + " (HTTP " + response.getResponseCode() + ")");
    return;
  }

  var stories = JSON.parse(response.getContentText());
  if (!stories || stories.length === 0) {
    Logger.log("Digest is empty for " + today);
    return;
  }

  var byTheme = {};
  stories.forEach(function (s) {
    if (!byTheme[s.theme]) byTheme[s.theme] = [];
    byTheme[s.theme].push(s);
  });

  var themeCount = Object.keys(byTheme).length;
  var sections = [];

  // Header section with summary stats
  sections.push({
    widgets: [
      {
        decoratedText: {
          icon: { knownIcon: "DESCRIPTION" },
          text: "<b>" + stories.length + " curated stories</b>  |  " + themeCount + " themes",
        },
      },
      {
        decoratedText: {
          icon: { knownIcon: "CLOCK" },
          text: today,
        },
      },
      { divider: {} },
      {
        textParagraph: {
          text: '<font color="#666666"><i>Themes: ' + Object.keys(byTheme).join("  ·  ") + "</i></font>",
        },
      },
    ],
  });

  // One section per theme
  var themes = Object.keys(byTheme);
  themes.forEach(function (theme, themeIndex) {
    var widgets = [];

    byTheme[theme].forEach(function (story, storyIndex) {
      // Divider between stories within a theme
      if (storyIndex > 0) {
        widgets.push({ divider: {} });
      }

      widgets.push({
        columns: {
          columnItems: [
            {
              horizontalSizeStyle: "FILL_AVAILABLE_SPACE",
              horizontalAlignment: "START",
              verticalAlignment: "CENTER",
              widgets: [
                {
                  decoratedText: {
                    text: '<b><a href="' + story.url + '">' + escapeHtml(story.headline) + "</a></b>",
                    wrapText: true,
                    bottomLabel: story.source,
                  },
                },
              ],
            },
          ],
        },
      });

      widgets.push({
        textParagraph: {
          text: '<font color="#555555">' + escapeHtml(story.summary) + "</font>",
        },
      });

      // "Read more" button
      widgets.push({
        buttonList: {
          buttons: [
            {
              text: "Read article",
              onClick: {
                openLink: { url: story.url },
              },
            },
          ],
        },
      });
    });

    sections.push({
      header: theme + "  (" + byTheme[theme].length + ")",
      collapsible: true,
      uncollapsibleWidgetsCount: 3,
      widgets: widgets,
    });
  });

  // Footer
  sections.push({
    widgets: [
      { divider: {} },
      {
        textParagraph: {
          text: '<font color="#999999">AI Intelligence Digest  ·  Automated daily via GitHub Actions + Claude</font>',
        },
      },
    ],
  });

  var cardMessage = {
    cardsV2: [
      {
        cardId: "digest-" + today,
        card: {
          header: {
            title: "AI Intelligence Digest",
            subtitle: today + "  ·  " + stories.length + " stories across " + themeCount + " themes",
            imageUrl: "https://www.gstatic.com/images/branding/product/2x/google_news_64dp.png",
            imageType: "CIRCLE",
          },
          sections: sections,
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

  var postResponse = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log("Posted to Google Chat: HTTP " + postResponse.getResponseCode());
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
