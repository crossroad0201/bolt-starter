// `cp _env .env` then modify it
// See https://github.com/motdotla/dotenv
const config = require("dotenv").config().parsed;
// Overwrite env variables anyways
for (const k in config) {
  process.env[k] = config[k];
}

const { LogLevel, ConsoleLogger } = require("@slack/logger");
const logLevel = process.env.SLACK_LOG_LEVEL || LogLevel.DEBUG;
const logger = new ConsoleLogger();
logger.setLevel(logLevel);

const { App, ExpressReceiver } = require("@slack/bolt");
// Manually instantiate to add external routes afterwards
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});
const app = new App({
  logger: logger,
  logLevel: logLevel,
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

// ---------------------------------------------------------------
// Start coding here..
// see https://slack.dev/bolt/

// https://api.slack.com/apps/{APP_ID}/event-subscriptions
app.event("app_mention", ({ event, say }) => {
  logger.debug(
    "app_mention event payload:\n\n" + JSON.stringify(event, null, 2) + "\n"
  );
  say({
    channel: event.channel,
    text: `:wave: <@${event.user}> Hi there!`
  });
});

// https://api.slack.com/apps/{APP_ID}/slash-commands
// https://api.slack.com/apps/{APP_ID}/interactive-messages
app.command("/open-modal", ({ ack, body, context }) => {
  app.client.views
    .open({
      "token": context.botToken,
      "trigger_id": body.trigger_id,
      // Block Kit Builder - http://j.mp/bolt-starter-modal-json
      "view": {
        "type": "modal",
        "callback_id": "task-modal",
        "private_metadata": JSON.stringify(body), // Remove this when pasting this in Block Kit Builder
        "title": {
            "type": "plain_text",
            "text": "休暇申請",
            "emoji": true
          },
          "submit": {
            "type": "plain_text",
            "text": "送信",
            "emoji": true
          },
          "close": {
            "type": "plain_text",
            "text": "キャンセル",
            "emoji": true
          },
          "blocks": [
            {
              "block_id": "input-date",
              "type": "input",
              "element": {
                "action_id": "input",
                "type": "datepicker",
                "placeholder": {
                  "type": "plain_text",
                  "text": "休暇を取得する日を選択",
                  "emoji": true
                }
              },
              "label": {
                "type": "plain_text",
                "text": "取得日：",
                "emoji": true
              }
            },
            {
              "block_id": "input-type",
              "type": "input",
              "element": {
                "action_id": "input",
                "type": "static_select",
                "placeholder": {
                  "type": "plain_text",
                  "text": "休暇の種別を選択",
                  "emoji": true
                },
                "options": [
                  {
                    "text": {
                      "type": "plain_text",
                      "text": "全休",
                      "emoji": true
                    },
                    "value": "ALL_DAY"
                  },
                  {
                    "text": {
                      "type": "plain_text",
                      "text": "午前休",
                      "emoji": true
                    },
                    "value": "AM"
                  },
                  {
                    "text": {
                      "type": "plain_text",
                      "text": "午後休",
                      "emoji": true
                    },
                    "value": "PM"
                  }
                ]
              },
              "label": {
                "type": "plain_text",
                "text": "休暇種別：",
                "emoji": true
              }
            },
            {
              "block_id": "input-reason",
              "type": "input",
              "element": {
                "action_id": "input",
                "type": "plain_text_input",
                "multiline": true
              },
              "label": {
                "type": "plain_text",
                "text": "取得理由：",
                "emoji": true
              }
            }
          ]

      }
    })
    .then(res => {
      logger.debug(
        "views.open response:\n\n" + JSON.stringify(res, null, 2) + "\n"
      );
      ack();
    })
    .catch(e => {
      logger.error("views.open error:\n\n" + JSON.stringify(e, null, 2) + "\n");
      ack(`:x: Failed to open a modal due to *${e.code}* ...`);
    });
});

app.view("task-modal", async ({ body, ack }) => {
  logger.debug(
    "view_submission view payload:\n\n" +
    JSON.stringify(body.view, null, 2) +
    "\n"
  );

  const stateValues = body.view.state.values;
  const date = stateValues["input-date"]["input"].selected_date;
  const type = stateValues["input-type"]["input"]["selected_option"].value;
  const reason = stateValues["input-reason"]["input"].value;

  // Save the input to somewhere
  logger.info(
    `Valid response:\ndate: ${date}\ntype: ${type}\nreason: ${reason}\n`
  );
  // Post a message using response_url given by the slash comamnd
  const command = JSON.parse(body.view.private_metadata);
  await postViaResponseUrl(
    command.response_url, // available for 30 minutes
    {
      "response_type": "ephemeral", // or "in_channel"
      "text": "[fallback] Somehow Slack app failed to render blocks",
      // Block Kit Builder - http://j.mp/bolt-starter-msg-json
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*休暇を申請しました！！*"
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": `*取得日：* ${date}`
            },
            {
              "type": "mrkdwn",
              "text": `*休暇種別：* ${type}`
            },
            {
              "type": "mrkdwn",
              "text": `*取得理由：* ${reason}`
            }
          ]
        }
      ]
    }
  );

  ack();
});

// ---------------------------------------------------------------

// Utility to post a message using response_url
const axios = require('axios');
function postViaResponseUrl(responseUrl, response) {
  return axios.post(responseUrl, response);
}

// Request dumper middleware for easier debugging
if (process.env.SLACK_REQUEST_LOG_ENABLED === "1") {
  app.use(args => {
    args.context = JSON.parse(JSON.stringify(args.context));
    args.context.botToken = 'xoxb-***';
    if (args.context.userToken) {
      args.context.userToken = 'xoxp-***';
    }
    logger.debug(
      "Dumping request data for debugging...\n\n" +
      JSON.stringify(args, null, 2) +
      "\n"
    );
    args.next();
  });
}

receiver.app.get("/", (_req, res) => {
  res.send("Your Bolt ⚡️ App is running!");
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ Bolt app is running!");
})();
