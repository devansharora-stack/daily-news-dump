var B2B_REPO_OWNER = "devansharora-stack";
var B2B_REPO_NAME = "daily-news-dump";
var B2B_BRANCH = "main";

var B2B_WEBHOOK_URL = PropertiesService.getScriptProperties().getProperty("B2B_GOOGLE_CHAT_WEBHOOK_URL");

function sendB2BDaily() {
  var today = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  var url = "https://raw.githubusercontent.com/" + B2B_REPO_OWNER + "/" + B2B_REPO_NAME + "/" + B2B_BRANCH + "/b2b-digests/" + today + ".json";

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

  var digest = JSON.parse(response.getContentText());
  if (!digest || !digest.type) {
    Logger.log("B2B digest is empty or missing type for " + today);
    return;
  }

  var cardMessage;

  if (digest.type === "resource") {
    cardMessage = buildResourceCard(digest);
  } else if (digest.type === "recap-and-resource") {
    cardMessage = buildThursdayCard(digest);
  } else if (digest.type === "recap-week") {
    cardMessage = buildWeekRecapCard(digest);
  } else {
    Logger.log("Unknown digest type: " + digest.type);
    return;
  }

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(cardMessage),
    muteHttpExceptions: true,
  };

  var postResponse = UrlFetchApp.fetch(B2B_WEBHOOK_URL, options);
  Logger.log("Posted B2B digest (" + digest.type + ") to Google Chat: HTTP " + postResponse.getResponseCode());
}

// ========== RESOURCE DAY CARD (Mon/Tue/Wed/Fri/Sat) ==========
function buildResourceCard(digest) {
  var keyNotesHtml = "";
  for (var i = 0; i < digest.keyNotes.length; i++) {
    keyNotesHtml += "• " + escB2B(digest.keyNotes[i]) + "<br><br>";
  }

  return {
    cardsV2: [{
      cardId: "b2b-resource-" + digest.date,
      card: {
        header: {
          title: "📚 B2B Learning: " + escB2B(digest.topic),
          subtitle: digest.date + "  ·  " + digest.dayLabel,
          imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/school/default/48px.svg",
          imageType: "CIRCLE",
        },
        sections: [
          {
            widgets: [{
              textParagraph: {
                text: "<b><a href=\"" + digest.url + "\">" + escB2B(digest.headline) + "</a></b><br><font color=\"#666666\">" + escB2B(digest.source) + "</font>",
              },
            }],
          },
          {
            widgets: [{
              buttonList: {
                buttons: [{
                  text: "Read the case study",
                  onClick: { openLink: { url: digest.url } },
                }],
              },
            }],
          },
          { widgets: [{ divider: {} }] },
          {
            header: "Key Notes",
            collapsible: false,
            widgets: [{
              textParagraph: {
                text: keyNotesHtml,
              },
            }],
          },
          {
            header: "🤔 Think About This",
            widgets: [{
              textParagraph: {
                text: "<i>" + escB2B(digest.question) + "</i>",
              },
            }],
          },
          {
            widgets: [
              { divider: {} },
              {
                buttonList: {
                  buttons: [{
                    text: "Read the case study",
                    onClick: { openLink: { url: digest.url } },
                  }],
                },
              },
            ],
          },
          {
            widgets: [{
              textParagraph: {
                text: '<font color="#999999">B2B Marketing Sprint  ·  Weekly learning via GitHub Actions + Gemini</font>',
              },
            }],
          },
        ],
      },
    }],
  };
}

// ========== THURSDAY CARD (Recap + New Topic Intro) ==========
function buildThursdayCard(digest) {
  // Build recap resources list
  var recapLinksHtml = "";
  for (var i = 0; i < digest.recapResources.length; i++) {
    var r = digest.recapResources[i];
    recapLinksHtml += "• <a href=\"" + r.url + "\">" + escB2B(r.headline) + "</a> (" + escB2B(r.source) + ")<br>";
  }

  var keyNotesHtml = "";
  for (var j = 0; j < digest.keyNotes.length; j++) {
    keyNotesHtml += "• " + escB2B(digest.keyNotes[j]) + "<br><br>";
  }

  return {
    cardsV2: [
      {
        cardId: "b2b-recap-" + digest.date,
        card: {
          header: {
            title: "📋 Mid-Week Recap: " + escB2B(digest.recapTopic),
            subtitle: digest.date + "  ·  What we learned Mon–Wed",
            imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/checklist/default/48px.svg",
            imageType: "CIRCLE",
          },
          sections: [
            {
              header: "Recap",
              widgets: [{
                textParagraph: {
                  text: formatRecap(digest.recap),
                },
              }],
            },
            {
              header: "Articles Covered",
              widgets: [{
                textParagraph: {
                  text: recapLinksHtml,
                },
              }],
            },
            {
              widgets: [{
                textParagraph: {
                  text: '<font color="#999999">B2B Marketing Sprint  ·  Topic A complete ✓</font>',
                },
              }],
            },
          ],
        },
      },
      {
        cardId: "b2b-intro-" + digest.date,
        card: {
          header: {
            title: "🔜 Up Next: " + escB2B(digest.topic),
            subtitle: digest.dayLabel,
            imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/school/default/48px.svg",
            imageType: "CIRCLE",
          },
          sections: [
            {
              widgets: [{
                textParagraph: {
                  text: "<b><a href=\"" + digest.url + "\">" + escB2B(digest.headline) + "</a></b><br><font color=\"#666666\">" + escB2B(digest.source) + "</font>",
                },
              }],
            },
            {
              widgets: [{
                buttonList: {
                  buttons: [{
                    text: "Read the case study",
                    onClick: { openLink: { url: digest.url } },
                  }],
                },
              }],
            },
            { widgets: [{ divider: {} }] },
            {
              header: "Key Notes",
              widgets: [{
                textParagraph: {
                  text: keyNotesHtml,
                },
              }],
            },
            {
              header: "🤔 Think About This",
              widgets: [{
                textParagraph: {
                  text: "<i>" + escB2B(digest.question) + "</i>",
                },
              }],
            },
            {
              widgets: [
                { divider: {} },
                {
                  buttonList: {
                    buttons: [{
                      text: "Read the case study",
                      onClick: { openLink: { url: digest.url } },
                    }],
                  },
                },
              ],
            },
            {
              widgets: [{
                textParagraph: {
                  text: '<font color="#999999">B2B Marketing Sprint  ·  Topic B begins</font>',
                },
              }],
            },
          ],
        },
      },
    ],
  };
}

// ========== SUNDAY WEEK RECAP CARD ==========
function buildWeekRecapCard(digest) {
  var resourcesHtml = "";
  for (var i = 0; i < digest.resources.length; i++) {
    var r = digest.resources[i];
    resourcesHtml += "• <a href=\"" + r.url + "\">" + escB2B(r.headline) + "</a><br><font color=\"#666666\">  " + escB2B(r.source) + " · " + escB2B(r.topic) + "</font><br><br>";
  }

  return {
    cardsV2: [{
      cardId: "b2b-week-recap-" + digest.date,
      card: {
        header: {
          title: "🎓 This Week in B2B Learning",
          subtitle: digest.date + "  ·  Week Recap",
          imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg",
          imageType: "CIRCLE",
        },
        sections: [
          {
            header: "What You Learned",
            widgets: [{
              textParagraph: {
                text: formatRecap(digest.recap),
              },
            }],
          },
          {
            header: "All Resources This Week",
            widgets: [{
              textParagraph: {
                text: resourcesHtml,
              },
            }],
          },
          {
            widgets: [
              { divider: {} },
              {
                textParagraph: {
                  text: '<font color="#999999">B2B Marketing Sprint  ·  See you next week! 🚀</font>',
                },
              },
            ],
          },
        ],
      },
    }],
  };
}

function formatRecap(recap) {
  if (!recap) return "";
  // New format: {intro, bullets} or {intro, bullets, closing}
  if (typeof recap === "object" && recap.intro) {
    var html = escB2B(recap.intro) + "<br><br>";
    if (recap.bullets && Array.isArray(recap.bullets)) {
      for (var i = 0; i < recap.bullets.length; i++) {
        html += "▸ " + escB2B(recap.bullets[i]) + "<br><br>";
      }
    }
    if (recap.closing) {
      html += "<b>" + escB2B(recap.closing) + "</b>";
    }
    return html;
  }
  // Legacy: array of bullets
  if (Array.isArray(recap)) {
    var out = "";
    for (var j = 0; j < recap.length; j++) {
      out += "▸ " + escB2B(recap[j]) + "<br><br>";
    }
    return out;
  }
  return escB2B(String(recap));
}

function escB2B(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
