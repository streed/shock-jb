const { Client, GatewayIntentBits, messageLink } = require('discord.js');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');

const MODES = {
  OFF:          'off',
  ON:           'on',
  ALLOWED_ONLY: 'allowed',
  TARGET:       'target',
  TARGET_PING:  'target_ping'
};

const ONE_HOUR = 60 * 60 * 1000;

process.env.PAVLOK_API_TOKEN = process.env.API_TOKEN
const SECRETS = {
  PAVLOK_API_TOKEN: process.env.PAVLOK_API_TOKEN
};

const ENV = {
  DEBUG: process.env.DEBUG ? true : false,
  ALLOWED: process.env.ALLOWED ? process.env.ALLOWED.split(',') : [],
  TARGET: process.env.TARGET
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })
let Context = {
   allowed_users: ENV.ALLOWED.concat(ENV.TARGET ? [ENV.TARGET] : []),
    mode: {
        active_mode: MODES.ALLOWED_ONLY,
        opts: {
            target_checkin_interval: 1
        }
    },

    stats: {
        total_zaps: 0,
        total_vibes: 0,
        users: {}
    }
};

console.log(Context)

function allowed(user, mode = MODES.ALLOWED_ONLY) {
    switch(mode) {
        case MODES.OFF:
            return false;
        case MODES.ON:
            return true;
        case MODES.ALLOWED_ONLY:
            return Context.allowed_users.indexOf(user) >= 0;
        case MODES.TARGET:
        case MODES.TARGET_PING:
            if (Context.mode.opts.target_last_checkin && Context.mode.opts.target_last_checkin - ONE_HOUR > Date.now() ) {
                return allowed(user, MODES.ALLOWED_ONLY);
            }
            Context.mode.active_mode = MODES.TARGET_PING;
            return false;
        default:
            console.error('allowed check failed for user %s and mode %s', user, mode);
            return false;
    }
}

async function sendStimulus(type, value, reason) {
    const options = {
        method: 'POST',
        url: 'https://api.pavlok.com/api/v5/stimulus/send',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            Authorization: SECRETS.PAVLOK_API_TOKEN
        },
        data: {stimulus: {stimulusType: type, stimulusValue: value, reason: reason}}
    };

    axios.request(options).catch(function (error) {
        console.error(error);
    });
}

async function sendMessage(channelId, msg) {
    client.channels.cache.get(channelId).send(msg);
}

client.on('ready', () => {
    if (ENV.DEBUG) {
        console.log('[DEBUG] ENV config values: %O', ENV);
    }

    console.log('Logged in as Discord user: %s', client.user.tag);
    console.log('Current mode: %s', Context.mode.active_mode);

    startWebhookHandler();
});

client.on('messageCreate', async msg => {
    const user = msg.author.id;

    console.log('Received message from: %s', user);
    if (ENV.DEBUG) {
        console.log('[DEBUG] Content: %s', msg.content);
    }

    if (!allowed(user)) {
        console.log(`User not allowed`);
        return;
    } else if (ENV.DEBUG) {
        console.log('[DEBUG] User ${user} is allowed', user);
    }

    remaining_args = msg.content.split(' ');

    const cmd = remaining_args.shift();

    sendToAI(msg);

    switch(cmd) {
        case '!ack':
            if (user === ENV.TARGET) {
                Context.mode.active_mode = MODES.TARGET;
                Context.mode.opts.target_last_checkin = Date.now();
                msg.react('✔️');
            }
            break;

        case '!mode':
            await sendMessage(msg.channelId, `Current mode: ${Context.mode.active_mode}`);
            break;

        case '!stats':
            await sendMessage(msg.channelId, `Total shocks: ${Context.stats.total_zaps} and Total Vibes: ${Context.stats.total_vibes} since last deploy.`);
            break;

        default:
            console.error('Invalid cmd \'%s\' received', cmd);
            break;
    }
});

function sendToAI(msg) {
    const id = `${msg.channelId}-${msg.id}`;
    const body = msg.content;
    const timestamp = Math.round((new Date()).getTime() / 1000);

    const request = {
        id,
        body,
        timestamp,
        signature: generateSignature(id, body, timestamp, process.env.SECRET_KEY)
    }

    console.log(request)

    const options = {
        method: 'POST',
        url: process.env.AI_WEBHOOK,
        headers: {
            accept: 'application/json',
            'content-type': 'application/json'
        },
        data: { llama: request}
    };

    axios.request(options).catch(function (error) {
        console.error("Request Failed")
    });
}

function generateSignature(id, body, timestamp, secret) {
    return crypto.createHmac('sha256', secret).update(`${id}${body}${timestamp}`).digest('hex');
}

function startWebhookHandler() {
    var server = http.createServer(function (req, res) {
        body = "";
        req.on('data', function (chunk) {
            body += chunk;
        });
      
        req.on('end', async function () {
          try {
            var request = JSON.parse(body);
            if (request.type === "validate") {
              var hash = crypto.createHmac('sha256', secret).update(`${request.timestamp}${request.value}`);
              res.write(JSON.stringify({
                  "code": hash.digest('hex')
              }));
      
              res.end();
            } else {
              const [channelId, messageId] = request.id.split('-');
              const command = request.response.output;
              const reasoning = request.response.reasoning;
              let msg;

              console.log(command, reasoning)

              switch (command) {
                case "shock": 
                    msg = await (await client.channels.fetch(channelId)).messages.fetch(messageId);
                    await sendStimulus('zap', 50, 'Zap Check!');
                    await msg.react('🍇');
                    Context.stats.total_zaps++;
                    Context.stats.users[user]++;
                    break;
                case "vibrate":
                    msg = await (await client.channels.fetch(channelId)).messages.fetch(messageId);
                    await sendStimulus('vibe', 15, 'Vibe Check!');
                    await msg.react('🍊');
                    Context.stats.total_vibes++;
                    Context.stats.users[user]++;
                    break;
                default:
                    console.log("do nothing");
              }

              client.channels.fetch(channelId).
              res.end()
            }
          } catch (e) {
            res.end();
          }
        });
      });
      server.listen(8000);
}

// Log In our bot
client.login(process.env.DISCORD);
