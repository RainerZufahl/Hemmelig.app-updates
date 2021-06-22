const config = require('config');
const asyncRedis = require('async-redis');
const { nanoid } = require('nanoid');

const isValidTTL = require('../helpers/validate-ttl');

const options = {
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    tls: config.get('redis.tls'),
};

if (config.get('redis.user', null) && config.get('redis.password', null)) {
    Object.assign(options, {
        user: config.get('redis.user', null),
        password: config.get('redis.password', null),
    });
}

const client = asyncRedis.createClient();

client.on('error', (error) => console.error(error));

const DEFAULT_EXPIRE = 60 * 60 * 24; // One day
const DEFAULT_RATE_LIMIT_EXPIRE = 60; // 1 minute
const DEFAULT_RATE_LIMIT_QTY = 100;

function createSecret(data, ttl) {
    const key = `secret:${data.id}`;
    const prepare = [key, 'secret', data.secret];

    if (data.password) {
        prepare.push(...['password', data.password]);
    }

    client
        .multi()
        .hmset(prepare)
        .expire(key, isValidTTL(Number(ttl)) ? ttl : DEFAULT_EXPIRE)
        .exec();
}

async function getSecret(id) {
    const data = await client.hgetall(`secret:${id}`);

    return data;
}

async function deleteSecret(id) {
    await client.delete(`secret:${id}`);
}

async function isAlive() {
    if ((await client.ping()) === 'PONG') {
        return true;
    }

    return false;
}

async function createUser(username, password) {
    return await client.hmset(
        `user:${username}`,
        'username',
        username,
        'password',
        password,
        'basic_auth_token',
        nanoid()
    );
}

async function getUser(username) {
    return await client.hgetall(`user:${username}`);
}

async function deleteUser(username) {
    return await client.delete(`user:${username}`);
}

async function createRateLimit(ip) {
    const key = `rate_limit:${ip}`;

    const increments = await new Promise((resolve, reject) => {
        client
            .multi()
            .incr(key)
            .expire(key, DEFAULT_RATE_LIMIT_EXPIRE)
            .exec((err, res) => {
                if (err) {
                    reject(err);
                }

                const [reply, _] = res;

                resolve(reply);
            });
    });

    if (increments > DEFAULT_RATE_LIMIT_QTY) {
        return true;
    }

    return false;
}

module.exports = {
    createSecret,
    getSecret,
    deleteSecret,
    isAlive,
    createUser,
    getUser,
    deleteUser,
    createRateLimit,
};
