const { Client, GatewayIntentBits, messageLink } = require('discord.js');
const axios = require('axios');

const MODES = {
  OFF:          'off',     // Nobody on the server may send commands
  ON:           'on',      // Anyone on the server may send commands
  ALLOWED_ONLY: 'allowed', // Only users in the ENV.ALLOWED list may send commands

  TARGET:       'target',     // Only users in the ENV.ALLOWED list may send commands, target user will be periodically asked to
                              // confirm they are still around
  TARGET_PING:  'target_ping' // Ping the target, or watch for an !ack from the target
};

const ONE_HOUR = 60 * 60 * 1000; // In ms, to work with std


// All environment variables that are secrets, persisted at startup
const SECRETS = {
  PAVLOK_API_TOKEN = process.env.PAVLOK_API_TOKEN // API token to use for Pavlok requests
};

// All environment variables that are _not_ secrets, persisted at startup
const ENV = {
  DEBUG = process.env.DEBUG ? true : false, // Print debug logs

  ALLOWED = process.env.ALLOWED ? process.env.ALLOWED.split(',') : [], // List of users to add to allow list at startup
  TARGET = process.env.TARGET // Discord user for the person the stimuli are targetted at (wearer of the Pavlok device)
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });


// Holds all mutable data/configuration for the bot
let Context = {
   // Keeps track of users allowed to invoke any commands
   allowed_users = ENV.ALLOWED.concat(ENV.TARGET ? [ENV.TARGET] : []),

    mode = {
        active_mode = TARGET ? MODES.TARGET : MODES.ALLOWED_ONLY,
        opts = {
            target_checkin_interval = 1 // in hours
        }
    },

    stats = {
        total_zaps = 0,
        total_vibes = 0,
        users = {}
    }
};


async function allowed(user, mode = Context.mode.active_mode) {
    switch(mode) {
        case MODES.OFF:
            return false;
        case MODES.ON:
            return true;
        case MODES.ALLOWED_ONLY:
            return Context.allowed_users.indexOf(user) >= 0;
        case MODES.TARGET: case MODES.TARGET_PING:
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


// Send stimulus to the Pavlok
async function sendStimulus(type, value, reason) {
    const options = {
        method: 'POST',
        url: 'https://api.pavlok.com/api/v5/stimulus/send',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            Authorization: SECRETS.PAVOLOCK_API_TOKEN
        },
        data: {stimulus: {stimulusType: type, stimulusValue: value, reason: reason}}
    };

    axios.request(options).catch(function (error) {
        console.error(error);
    });
}

// Send message to Discord channel
async function sendMessage(channelId, msg) {
    client.channels.cache.get(channelId).send(msg);
}



client.on('ready', () => {
    if (ENV.DEBUG) {
        console.log('[DEBUG] ENV config values: %O', ENV);
    }

    console.log('Logged in as Discord user: %s', client.user.tag);
    console.log('Current mode: %s', MODE);
});


client.on('messageCreate', async msg => {
    const user = msg.author.id;

    console.log('Received message from: %s', user);
    if (ENV.DEBUG) {
        console.log('[DEBUG] Content: %s', msg.content);
    }

    if (user !== ENV.TARGET || ! await allowed(user)) {
        if (Context.mode.active_mode === MODES.TARGET_PING) {
            sendMessage(msg.channelId, `Hey <@${ENV.TARGET}> are you still around to get shocked?  pls !ack`);
        }
        msg.react('❌');
        return;
    } else if (ENV.DEBUG) {
        console.log('[DEBUG] User ${user} is allowed', user);
    }

    remaining_args = msg.content.split(' ');

    const cmd = remaining_args.shift();

    switch(cmd) {
        case '!ack':
            if (user === ENV.TARGET) {
                Context.mode.active_mode = MODES.TARGET;
                Context.mode.opts.target_last_checkin = Date.now();
                msg.react('✔️');
            } else {
                msg.react('❌');
            }
            break;

        case '!vibe':
            await sendStimulus('vibe', 15, 'Vibe Check!');
            await msg.react('🍊');
            Context.stats.total_vibes++;
            Context.stats.users[user]++;
            break;

        case '!zap':
        case '!shock':
            await sendStimulus('zap', 15, 'Zap Check!');
            await msg.react('🍇');
            Context.stats.total_zaps++;
            Context.stats.users[user]++;
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


// Log In our bot
client.login(process.env.DISCORD);
