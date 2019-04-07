'use strict';

const fs = require('fs');
const line = require('@line/bot-sdk');
const axios = require('axios');
const express = require('express');
const sgMail = require('@sendgrid/mail');

const mailTo = process.env.MAIL_TO || 'hoge@example.com';
const mailFrom = process.env.MAIL_FROM || 'hoge@example.com';
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '********');
const lineUserId = process.env.LINE_USER_ID || '********';
const port = process.env.PORT || 3000;
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '********',
  channelSecret: process.env.CHANNEL_SECRET || '********'
};

const client = new line.Client(config);
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/webhook', line.middleware(config), (req, res) => {
  console.log(config);
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      console.error(err.message);
      res.status(500).end();
    });
});

function sendMail2Operator(event, profile, buf, cb) {
  const msg = {
    to: mailTo,
    from: mailFrom,
    subject: `${profile.displayName} ${event.timestamp}`,
    text: 'Sample',
    attachments: [
      {
        content: buf.toString('base64'),
        filename: `${profile.displayName}-${event.source.userId}-${event.timestamp}.jpg`,
        type: 'image/jpeg',
        disposition: 'attachment'
      },
    ],
  };

  sgMail.send(msg, false, function (err, res) {
    console.log(res);
    if (err) {
      console.error('sgMail.send Failed');
      console.error(err);
      return cb(err);
    } else {
      return cb(null);
    }
  });
}

// event handler
function handleEvent(event) {
  if (
    event.type === 'message'
    && event.message.type === 'image'
    && event.message.contentProvider.type === 'line'
  ){
    axios.get(`https://api.line.me/v2/bot/profile/${event.source.userId}`, {
      headers: {
        'Authorization': 'Bearer ' + config.channelAccessToken,
      }
    }).then(profileResponse => {
      console.log(profileResponse.data);
      const member = profileResponse.data;
      axios.get(`https://api.line.me/v2/bot/message/${event.message.id}/content`, {
          responseType: 'arraybuffer',
          headers: {
            'Authorization': 'Bearer ' + config.channelAccessToken,
          }
      }).then(response => {
        const buf = new Buffer.from(response.data);
        if (buf.length > 10000000) {
          console.error("img too large");
          const str = { type: 'text', text: `失敗: 画像サイズが大きすぎます。` };
          return client.replyMessage(event.replyToken, str);
        } else {
          sendMail2Operator(event, member, buf, function (err) {
            if (err) {
              const str = { type: 'text', text: `失敗: メール送信失敗。管理者に問い合わせてください。` };
              return client.replyMessage(event.replyToken, str);
            } else {
              const str = { type: 'text', text: `成功: 画像を受け付けました。` };
              return client.replyMessage(event.replyToken, str);
            }
          });
        }
      });
    });
  }

  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  const echo = { type: 'text', text: event.message.text };

  return client.replyMessage(event.replyToken, echo);
}

app.listen(port, () => {
  console.log(`listening on ${port}`);
});1
