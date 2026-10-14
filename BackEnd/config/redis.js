const { createClient } = require("redis");

const redisClient = createClient({

    socket: {
        host: "127.0.0.1",
        port: 6379
    },

    password: process.env.REDIS_PASSWORD

});

redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err);
});

redisClient.on("connect", () => {
    console.log("Connecting to Redis...");
});

redisClient.on("ready", () => {
    console.log("Redis connected successfully!");
});

redisClient.on("reconnecting", () => {
    console.log("Redis reconnecting...");
});

const connectRedis = async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
};

module.exports = {
    redisClient,
    connectRedis
};
