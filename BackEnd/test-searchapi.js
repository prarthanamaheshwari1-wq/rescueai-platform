require("dotenv").config();

const {
    verifyImageSource
} = require("./services/imageAuthenticity");

async function test() {
    const imageUrl =
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Colosseum_in_Rome-April_2007-1-_copie_2B.jpg/1280px-Colosseum_in_Rome-April_2007-1-_copie_2B.jpg";

    const result = await verifyImageSource(imageUrl);

    console.log(
        JSON.stringify(result, null, 2)
    );
}

test();