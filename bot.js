#!/usr/bin/env node
const { channel, discord, token, youtube } = require('./config.json');
const { gameCmd, guild, server, ign } = require('./game-info.json');
const { emotes, raccEmotes } = require('./emotes.json');
const { raccbarkPath } = require('./audio.json');
const WebSocketClient = require('websocket').client;
const cmd = require('node-cmd');
const fs = require('fs');

// Play music
const musicDir = "music";
let audioFiles = fs.readdirSync(`${musicDir}/`);
let audioFile = "";
audioFiles = shuffle(audioFiles);
playAudioFile(audioFiles, 0);

const client = new WebSocketClient();
const account = 'raccmod';   // Replace with the account the bot runs as
const password = 'oauth:' + token;

client.cooldowns = new Map();

const botCommands = ['commands', gameCmd, 'discord', 'emotes', 'lurk', 'raccbark',
                     'song', 'youtube'];

// Used for ensuring the bot doesn't exceed the rate limits
const msgsLimit = 95;  // Actual limit is 100 messages but err on the safe side
const timeLimit = 1000 * 30;  // Window of time for rate limits is 30 seconds
let numMsgsSent = 0;

const moveMessage = 'Get up and move, your body will thank you!';
const defaultMoveInterval = 1000 * 60 * 1; // Set to 1 minute for testing.
let moveInterval = defaultMoveInterval;

client.on('connectFailed', function (error) {
    console.log('Connect Error: ' + error.toString());
});

client.on('connect', function (connection) {
    console.log('WebSocket Client Connected');

    // Giving the bot Twitch IRC capabilities.
    sendRateLimitedUTF(connection, 'CAP REQ :twitch.tv/commands twitch.tv/membership twitch.tv/tags');

    // Authenticate with the Twitch IRC server and then join the channel.
    // If the authentication fails, the server drops the connection.
    sendRateLimitedUTF(connection, `PASS ${password}`);
    sendRateLimitedUTF(connection, `NICK ${account}`);

    // Set a timer to track how many IRC messages
    // the bot sends in a given window of time.
    let rateLimitIntervalObj = setInterval(() => {
        numMsgsSent = 0;
    }, timeLimit);

    connection.on('error', function (error) {
        console.log("Connection Error: " + error.toString());
    });

    connection.on('close', function () {
        console.log('Connection Closed');
        console.log(`close description: ${connection.closeDescription}`);
        console.log(`close reason code: ${connection.closeReasonCode}`);

        clearInterval(rateLimitIntervalObj);
    });

    // Process the Twitch IRC message.
    connection.on('message', function (ircMessage) {
        if (ircMessage.type === 'utf8') {
            let rawIrcMessage = ircMessage.utf8Data.trimEnd();
            console.log(`Message received (${new Date().toISOString()}): '${rawIrcMessage}'\n`);

            let messages = rawIrcMessage.split('\r\n');  // The IRC message may contain one or more messages.
            messages.forEach(message => {
                let parsedMessage = parseMessage(message);

                if (parsedMessage) {
                    // console.log(`Message command: ${parsedMessage.command.command}`);
                    // console.log(`\n${JSON.stringify(parsedMessage, null, 3)}`)

                    switch (parsedMessage.command.command) {
                        case 'PRIVMSG':
                            // to use /me: `PRIVMSG ${channel} :/me <message>`

                            // Set up the start of a PRIVMSG message
                            const parentMsgId = parsedMessage.tags.id;
                            const replyTag = `@reply-parent-msg-id=${parentMsgId}`;
                            const commandComponent = `PRIVMSG ${channel}`;
                            const msgStarter = `${replyTag} ${commandComponent}`;

                            // Handy variables to use for chat commands
                            const botCommand = parsedMessage.command.botCommand;
                            const displayName = parsedMessage.tags['display-name'];
                            const userId = parsedMessage.tags['user-id'];

                            switch (botCommand) {
                                /*
                                case 'move':
                                    if (parsedMessage.command.botCommandParams.length == 0 ||
                                        !isNumeric(parsedMessage.command.botCommandParams[0])) {
                                        sendRateLimitedUTF(connection, `PRIVMSG ${channel} :
                                            !${botCommand} needs 1 numeric parameter.`);
                                    } else {
                                        let updateInterval = (parsedMessage.command.botCommandParams[0]) ?
                                            parseInt(parsedMessage.command.botCommandParams[0]) * 1000 * 60 : defaultMoveInterval;

                                        if (moveInterval != updateInterval) {
                                            // Valid range: 1 minute to 60 minutes
                                            if (updateInterval >= 60000 && updateInterval <= 3600000) {
                                                moveInterval = updateInterval;

                                                // Reset the timer.
                                                clearInterval(intervalObj);
                                                intervalObj = null;
                                                intervalObj = setInterval(() => {
                                                    sendRateLimitedUTF(connection, `PRIVMSG ${channel} :${moveMessage}`);
                                                }, moveInterval);
                                            }
                                        }
                                    }
                                    break;
                                case 'moveoff':
                                    clearInterval(intervalObj);
                                    sendRateLimitedUTF(connection, `PART ${channel}`);
                                    connection.close();
                                    break;
                                */
                                case 'commands':
                                    let commandsMsg = `!${botCommands[0]}`;

                                    for (let i = 1; i < botCommands.length; i++) {
                                        commandsMsg += ` | !${botCommands[i]}`;
                                    }

                                    sendRateLimitedUTF(connection, `${msgStarter} :${commandsMsg}`);
                                    break;
                                case 'emotes':
                                    let emotesMsg = `racc${raccEmotes[0]}`;

                                    for (let i = 1; i < raccEmotes.length; i++) {
                                        emotesMsg += ` racc${raccEmotes[i]}`;
                                    }

                                    for (let i = 0; i < emotes.length; i++) {
                                        emotesMsg += ` ${emotes[i]}`;
                                    }

                                    sendRateLimitedUTF(connection, `${msgStarter} :${emotesMsg}`);
                                    break;
                                case gameCmd:
                                    const gameMsg = `IGN: ${ign} | Guild: ${guild} | Server: ${server}`;

                                    sendRateLimitedUTF(connection, `${msgStarter} :${gameMsg}`);
                                    break;
                                case 'discord':
                                    sendRateLimitedUTF(connection, `${msgStarter} :${discord}`);
                                    break;
                                case 'lurk':
                                    const lurkMsg = `Have a good racclurk, ${displayName}. RaccAttack`;

                                    sendRateLimitedUTF(connection, `${msgStarter} :${lurkMsg}`);
                                    break;
                                case 'raccbark':
                                    // Cooldown logic (for specifically raccbark, will expand to other commands)
                                    const cooldowns = client.cooldowns;

                                    if (!cooldowns.has(botCommand)) {
                                        cooldowns.set(botCommand, new Map());
                                    }

                                    const now = Date.now();
                                    const timestamps = cooldowns.get(botCommand);
                                    const defaultCooldownDuration = 10;
                                    const cooldownAmount = defaultCooldownDuration * 1000;

                                    if (timestamps.has(userId)) {
                                        const expirationTime = timestamps.get(userId) + cooldownAmount;

                                        if (now < expirationTime) {
                                            const timeLeft = convertDuration(Math.round((expirationTime - now) / 1000));
                                            const cdMsg = `Raccwait ${timeLeft} to raccuse '!${botCommand}'. RaccAttack`;

                                            sendRateLimitedUTF(connection, `${msgStarter} :${cdMsg}`);
                                            break;
                                        }
                                    }

                                    cmd.run(`powershell -c (New-Object Media.SoundPlayer ${raccbarkPath}).PlaySync();`);

                                    timestamps.set(userId, now);
                                    setTimeout(() => timestamps.delete(userId), cooldownAmount);

                                    break;
                                case 'song':
                                    const song = getSong(audioFile);

                                    sendRateLimitedUTF(connection, `${msgStarter} :${song}`);
                                    break;
                                case 'youtube':
                                    sendRateLimitedUTF(connection, `${msgStarter} :${youtube}`);
                                    break;
                                default:
                                    ; // Ignore all other bot commands or Twitch chat messages
                            }

                            // Send a chat message to first time or returning chatters
                            if (parsedMessage.tags['first-msg'] === '1') {
                                const welcomeMsg = `Raccwelcome, ${displayName}. RaccAttack`;

                                sendRateLimitedUTF(connection, `${msgStarter} :${welcomeMsg}`);
                            } else if (parsedMessage.tags['returning-chatter'] === '1') {
                                const welcomeBackMsg = `Raccwelcome raccback, ${displayName}. RaccAttack`;

                                sendRateLimitedUTF(connection, `${msgStarter} :${welcomeBackMsg}`);
                            }

                            break;
                        case 'PING':
                            sendRateLimitedUTF(connection, 'PONG ' + parsedMessage.parameters);
                            break;
                        case '001':
                            // Successfully logged in, so join the channel.
                            sendRateLimitedUTF(connection, `JOIN ${channel}`);
                            break;
                        case 'JOIN':
                            // Send the initial move message. All other move messages are
                            // sent by the timer.
                            // sendRateLimitedUTF(connection, `PRIVMSG ${channel} :${moveMessage}`);
                            break;
                        case 'PART':
                            if (parsedMessage.source.nick === 'raccmod') {
                                console.log('The channel must have banned (/ban) the bot.');
                                connection.close();
                            }
                            break;
                        case 'NOTICE':
                            // If the authentication failed, leave the channel.
                            // The server will close the connection.
                            if (parsedMessage.parameters === 'Login authentication failed') {
                                console.log(`Authentication failed; left ${channel}`);
                                sendRateLimitedUTF(connection, `PART ${channel}`);
                            } else if (parsedMessage.parameters === 'You don’t have permission to perform that action') {
                                console.log(`No permission. Check if the access token is still valid. Left ${channel}`);
                                sendRateLimitedUTF(connection, `PART ${channel}`);
                            }
                            break;
                        case 'CLEARCHAT':
                            if (parsedMessage.tags['target-user-id']) {
                                const username = capitalize(parsedMessage.parameters);

                                if (parsedMessage.tags['ban-duration']) {
                                    // if the user was timed out
                                    const banDuration = convertDuration(parsedMessage.tags['ban-duration']);
                                    const timeoutMsg = `${username} has been raccsentenced to ${banDuration} in raccprison. RaccAttack`;

                                    sendRateLimitedUTF(connection, `PRIVMSG ${channel} :${timeoutMsg}`);
                                } else {
                                    // if the user was banned
                                    const banMsg = `${username} has been raccbanished. RaccAttack`;

                                    sendRateLimitedUTF(connection, `PRIVMSG ${channel} :${banMsg}`);
                                }
                            } else {
                                // if the chat was cleared (for non-moderator viewers)
                                const clearChatMsg = 'Raccnothing to see here. RaccAttack';

                                sendRateLimitedUTF(connection, `PRIVMSG ${channel} :${clearChatMsg}`);
                            }
                            break;
                        case 'CLEARMSG':
                            const clearMsgMsg = `Raccwatch what you raccsay, ${capitalize(parsedMessage.tags.login)}. RaccAttack`;

                            sendRateLimitedUTF(connection, `PRIVMSG ${channel} :${clearMsgMsg}`);
                        case 'GLOBALUSERSTATE':
                        case 'HOSTTARGET':
                        case 'NOTICE':
                        case 'RECONNECT':
                        case 'ROOMSTATE':
                        case 'USERNOTICE':
                        case 'USERSTATE':
                        case 'WHISPER':
                        default:
                            ; // Ignore all other IRC messages.
                    }
                }
            });
        }
    });

});

// Non-SSL WebSocket client
client.connect('ws://irc-ws.chat.twitch.tv:80');

// SSL WebSocket client
// client.connect('wss://irc-ws.chat.twitch.tv:443');

// Parses an IRC message and returns a JSON object with the message's 
// component parts (tags, source (nick and host), command, parameters). 
// Expects the caller to pass a single message. (Remember, the Twitch 
// IRC server may send one or more IRC messages in a single message.)
function parseMessage(message) {
    let parsedMessage = {  // Contains the component parts.
        tags: null,
        source: null,
        command: null,
        parameters: null
    };

    // The start index. Increments as we parse the IRC message.

    let idx = 0;

    // The raw components of the IRC message.

    let rawTagsComponent = null;
    let rawSourceComponent = null;
    let rawCommandComponent = null;
    let rawParametersComponent = null;

    // If the message includes tags, get the tags component of the IRC message.

    if (message[idx] === '@') {  // The message includes tags.
        let endIdx = message.indexOf(' ');
        rawTagsComponent = message.slice(1, endIdx);
        idx = endIdx + 1; // Should now point to source colon (:).
    }

    // Get the source component (nick and host) of the IRC message.
    // The idx should point to the source part; otherwise, it's a PING command.

    if (message[idx] === ':') {
        idx += 1;
        let endIdx = message.indexOf(' ', idx);
        rawSourceComponent = message.slice(idx, endIdx);
        idx = endIdx + 1;  // Should point to the command part of the message.
    }

    // Get the command component of the IRC message.

    let endIdx = message.indexOf(':', idx);  // Looking for the parameters part of the message.
    if (endIdx == -1) {                      // But not all messages include the parameters part.
        endIdx = message.length;
    }

    rawCommandComponent = message.slice(idx, endIdx).trim();

    // Get the parameters component of the IRC message.

    if (endIdx != message.length) {  // Check if the IRC message contains a parameters component.
        idx = endIdx + 1;            // Should point to the parameters part of the message.
        rawParametersComponent = message.slice(idx);
    }

    // Parse the command component of the IRC message.

    parsedMessage.command = parseCommand(rawCommandComponent);

    // Only parse the rest of the components if it's a command
    // we care about; we ignore some messages.

    if (parsedMessage.command == null) {  // Is null if it's a message we don't care about.
        return null;
    } else {
        if (rawTagsComponent != null) {  // The IRC message contains tags.
            parsedMessage.tags = parseTags(rawTagsComponent);
        }

        parsedMessage.source = parseSource(rawSourceComponent);

        parsedMessage.parameters = rawParametersComponent;
        if (rawParametersComponent && rawParametersComponent[0] === '!') {
            // The user entered a bot command in the chat window.            
            parsedMessage.command = parseParameters(rawParametersComponent, parsedMessage.command);
        }
    }

    return parsedMessage;
}

// Parses the tags component of the IRC message.

function parseTags(tags) {
    // badge-info=;badges=broadcaster/1;color=#0000FF;...

    const tagsToIgnore = {  // List of tags to ignore.
        'client-nonce': null,
        'flags': null
    };

    let dictParsedTags = {};  // Holds the parsed list of tags.
    // The key is the tag's name (e.g., color).
    let parsedTags = tags.split(';');

    parsedTags.forEach(tag => {
        let parsedTag = tag.split('=');  // Tags are key/value pairs.
        let tagValue = (parsedTag[1] === '') ? null : parsedTag[1];

        switch (parsedTag[0]) {  // Switch on tag name
            case 'badges':
            case 'badge-info':
                // badges=staff/1,broadcaster/1,turbo/1;

                if (tagValue) {
                    let dict = {};  // Holds the list of badge objects.
                    // The key is the badge's name (e.g., subscriber).
                    let badges = tagValue.split(',');
                    badges.forEach(pair => {
                        let badgeParts = pair.split('/');
                        dict[badgeParts[0]] = badgeParts[1];
                    })
                    dictParsedTags[parsedTag[0]] = dict;
                } else {
                    dictParsedTags[parsedTag[0]] = null;
                }
                break;
            case 'emotes':
                // emotes=25:0-4,12-16/1902:6-10

                if (tagValue) {
                    let dictEmotes = {};  // Holds a list of emote objects.
                    // The key is the emote's ID.
                    let emotes = tagValue.split('/');
                    emotes.forEach(emote => {
                        let emoteParts = emote.split(':');

                        let textPositions = [];  // The list of position objects that identify
                        // the location of the emote in the chat message.
                        let positions = emoteParts[1].split(',');
                        positions.forEach(position => {
                            let positionParts = position.split('-');
                            textPositions.push({
                                startPosition: positionParts[0],
                                endPosition: positionParts[1]
                            });
                        });

                        dictEmotes[emoteParts[0]] = textPositions;
                    })

                    dictParsedTags[parsedTag[0]] = dictEmotes;
                } else {
                    dictParsedTags[parsedTag[0]] = null;
                }

                break;
            case 'emote-sets':
                // emote-sets=0,33,50,237

                let emoteSetIds = tagValue.split(',');  // Array of emote set IDs.
                dictParsedTags[parsedTag[0]] = emoteSetIds;
                break;
            default:
                // If the tag is in the list of tags to ignore, ignore
                // it; otherwise, add it.

                if (tagsToIgnore.hasOwnProperty(parsedTag[0])) {
                    ;
                } else {
                    dictParsedTags[parsedTag[0]] = tagValue;
                }
        }
    });

    return dictParsedTags;
}

// Parses the command component of the IRC message.
function parseCommand(rawCommandComponent) {

    let parsedCommand = null;
    commandParts = rawCommandComponent.split(' ');

    switch (commandParts[0]) {
        // clearmsg, usernotice, whisper
        case 'JOIN':
        case 'PART':
        case 'NOTICE':
        case 'USERNOTICE':
        case 'CLEARCHAT':
        case 'CLEARMSG':
        case 'HOSTTARGET':
        case 'PRIVMSG':
            parsedCommand = {
                command: commandParts[0],
                channel: commandParts[1]
            };
            break;
        case 'PING':
            parsedCommand = {
                command: commandParts[0]
            };
            break;
        case 'CAP':
            parsedCommand = {
                command: commandParts[0],
                isCapRequestEnabled: (commandParts[2] === 'ACK') ? true : false,
                // The parameters part of the messages contains the 
                // enabled capabilities.
            };
            break;
        case 'GLOBALUSERSTATE':  // Included only if you request the /commands capability.
            // But it has no meaning without also including the /tags capability.
            parsedCommand = {
                command: commandParts[0]
            };
            break;
        case 'USERSTATE':   // Included only if you request the /commands capability.
        case 'ROOMSTATE':   // But it has no meaning without also including the /tags capabilities.
            parsedCommand = {
                command: commandParts[0],
                channel: commandParts[1]
            };
            break;
        case 'RECONNECT':
            console.log('The Twitch IRC server is about to terminate the connection for maintenance.');
            parsedCommand = {
                command: commandParts[0]
            };
            break;
        case 'WHISPER':
            parsedCommand = {
                command: commandParts[0],
                'from-user': commandParts[1]
            };
            break;
        case '421':
            console.log(`Unsupported IRC command: ${commandParts[2]}`);
            return null;
        case '001':  // Logged in (successfully authenticated). 
            parsedCommand = {
                command: commandParts[0],
                channel: commandParts[1]
            };
            break;
        case '002':  // Ignoring all other numeric messages.
        case '003':
        case '004':
        case '353':  // Tells you who else is in the chat room you're joining.
        case '366':
        case '372':
        case '375':
        case '376':
            console.log(`numeric message: ${commandParts[0]}`);
            return null;
        default:
            console.log(`\nUnexpected command: ${commandParts[0]}\n`);
            return null;
    }

    return parsedCommand;
}

// Parses the source (nick and host) components of the IRC message.
function parseSource(rawSourceComponent) {
    if (rawSourceComponent == null) {  // Not all messages contain a source
        return null;
    } else {
        let sourceParts = rawSourceComponent.split('!');
        return {
            nick: (sourceParts.length == 2) ? sourceParts[0] : null,
            host: (sourceParts.length == 2) ? sourceParts[1] : sourceParts[0]
        };
    }
}

// Parsing the IRC parameters component if it contains a command (e.g., !dice).
function parseParameters(rawParametersComponent, command) {
    let idx = 0;
    let commandParts = rawParametersComponent.slice(idx + 1).trim();
    let paramsIdx = commandParts.indexOf(' ');

    if (paramsIdx == -1) { // no parameters
        command.botCommand = commandParts.slice(0);
        command.botCommandParams = [];
    } else {
        command.botCommand = commandParts.slice(0, paramsIdx);
        command.botCommandParams = commandParts.slice(paramsIdx + 1).split(' ');
    }

    return command;
}

// Returns the capitalized version of a non-empty string.
function capitalize(str) {
    if (str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    return str;
}

// Converts the unit of some duration from seconds to
// denominatons of days, hours, minutes, and seconds.
function convertDuration(duration) {
    if (isNaN(duration) || (typeof duration == 'string' && parseInt(duration) < 0)
        || (typeof str == 'number' && duration < 0)) {
        return duration;
    }

    const conversionFactors = [31536000, 2592000, 604800, 86400, 3600, 60, 1];
    const denoms = [0, 0, 0, 0, 0];
    const units = ['raccyear', 'raccmonth', 'raccweek', 'raccday', 'racchour',
                   'raccminute', 'raccsecond'];

    let convertedDuration = '';
    let lastPositiveDenomIdx = -1;
    let numPositiveDenoms = 0;
    let seconds = parseInt(duration);

    for (let i = 0; i < units.length; i++) {
        denoms[i] = Math.floor(seconds / conversionFactors[i]);
        if (denoms[i] > 0) {
            lastPositiveDenomIdx = i;
            numPositiveDenoms += 1;
        }
        seconds %= conversionFactors[i];
    }

    if (numPositiveDenoms == 0) {
        convertedDuration = `${duration} ${units[units.length - 1]}s`;
    } else if (numPositiveDenoms == 1) {
        convertedDuration = `${denoms[lastPositiveDenomIdx]} ${units[lastPositiveDenomIdx]}`;
        if (denoms[lastPositiveDenomIdx] > 1) {
            convertedDuration += 's';
        }
    } else {
        for (let i = 0; i <= lastPositiveDenomIdx; i++) {
            if (denoms[i] > 0) {
                if (i == lastPositiveDenomIdx) {
                    convertedDuration += 'and ';
                }

                convertedDuration += `${denoms[i]} ${units[i]}`;
                if (denoms[i] > 1) {
                    convertedDuration += 's';
                }

                if (i < lastPositiveDenomIdx) {
                    if (numPositiveDenoms > 2) {
                        convertedDuration += ',';
                    }
                    convertedDuration += ' ';
                }
            }
        }
    }

    return convertedDuration;
}

// Returns the song from the audio file's name
function getSong(audioFile) {
    return audioFile.substring(0, audioFile.length - 4);
}

// Plays the audio file at some index in the array of audio files, and
// executes the callback function when the audio file finishes playing.
async function playAudioFile(audioFiles, index) {
    audioFile = audioFiles[index];
    const audioPath = `'${musicDir}/${audioFile}'`;

    setTimeout(() =>
        cmd.run(`powershell -c $PlayWav = New-Object Media.SoundPlayer;` +
                `$PlayWav.SoundLocation = ${audioPath};` +
                `$PlayWav.PlaySync();`,
            function (err, data, stderr) {
                if (index == audioFiles.length - 1) {
                    audioFiles = shuffle(audioFiles);
                    index = -1;
                }
                playAudioFile(audioFiles, index + 1);
            }
        ), 1000
    );
}

// Sends an IRC message and increments the number of messages
// sent in the current rate limit interval given a connection.
function sendRateLimitedUTF(connection, message) {
    if (numMsgsSent < msgsLimit) {
        connection.sendUTF(message);
        numMsgsSent += 1;
    }
}

// Returns a shuffled array using the Fisher-Yates algorithm
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}