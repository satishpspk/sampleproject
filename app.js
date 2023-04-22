const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("server has started at localhost");
    });
  } catch (e) {
    console.log(`DB ERROR : ${e.message}`);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const user = await db.get(checkUserQuery);
  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const updatedPassword = await bcrypt.hash(password, 10);
    console.log(updatedPassword);
    const registerQuery = `INSERT INTO user(username,password,name,gender) VALUES(
            '${username}',
            '${updatedPassword}',
            '${name}',
            '${gender}'
        );`;
    const dbResponse = await db.run(registerQuery);
    response.send("User created successfully");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const checkUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const user = await db.get(checkUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, user.password);
    if (checkPassword === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    }
  }
});

const authenticationMiddleWare = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const checkToken = jwt.verify(
      jwtToken,
      "SECRET_TOKEN",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
};

// api 3

app.get(
  "/user/tweets/feed/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    console.log(username);
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);

    const userId = usersList.user_id;

    const followingQuery = `SELECT user.username as username,tweet.tweet as tweet,tweet.date_time as date_time 
       FROM
           (follower INNER JOIN user 
            ON follower.following_user_id=user.user_id
            ) as T 
            INNER JOIN tweet ON T.following_user_id=tweet.user_id
       WHERE 
            follower.follower_user_id=${userId}
        ORDER BY tweet.date_time ;
        LIMIT 4;`;
    const followingList = await db.all(followingQuery);

    response.send(
      followingList.map((each) => ({
        username: each.username,
        tweet: each.tweet,
        dateTime: each.date_time,
      }))
    );
  }
);

// api 4
app.get(
  "/user/following/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);

    const userId = usersList.user_id;
    const followingQuery = `SELECT user.name FROM user INNER JOIN follower ON follower.following_user_id=user.user_id WHERE follower.follower_user_id=${userId}`;
    const followingList = await db.all(followingQuery);
    response.send(
      followingList.map((each) => ({
        name: each.name,
      }))
    );
  }
);

// api 5

app.get(
  "/user/followers/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);

    const userId = usersList.user_id;
    const followersQuery = `SELECT user.name FROM user INNER JOIN follower ON follower.follower_user_id=user.user_id WHERE follower.following_user_id=${userId}`;
    const followersList = await db.all(followersQuery);
    response.send(
      followersList.map((each) => ({
        name: each.name,
      }))
    );
  }
);

// api 6

app.get(
  "/tweets/:tweetId/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);
    const userId = usersList.user_id;

    // check following

    const tweeterIdQuery = `SELECT user_id FROM tweet WHERE tweet_Id=${tweetId};`;
    const tweeterIdObj = await db.get(tweeterIdQuery);
    const tweeterId = tweeterIdObj.user_id;

    const checkUserQuery = `SELECT following_user_id FROM follower where follower_user_id=${userId} AND following_user_id=${tweeterId}`;

    const followingList = await db.get(checkUserQuery);

    if (followingList === undefined || followingList === []) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const tweetListQuery = `SELECT tweet,date_time FROM tweet WHERE tweet_Id=${tweetId};`;
      const tweetList = await db.get(tweetListQuery);

      const likesCountQuery = `SELECT count(tweet_id) as likes from like WHERE tweet_Id=${tweetId}; GROUP BY tweet_id`;
      const likesCount = await db.get(likesCountQuery);

      const replyQuery = `SELECT count(tweet_id) as replies from reply WHERE tweet_Id=${tweetId}; GROUP BY tweet_id`;
      const replyObj = await db.get(replyQuery);

      const likes = likesCount.likes;
      const dateTime = tweetList.date_time;
      const tweet = tweetList.tweet;
      const replies = replyObj.replies;

      response.send({ tweet, likes, replies, dateTime });
    }
  }
);

// api 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);
    const userId = usersList.user_id;

    // check following

    const tweeterIdQuery = `SELECT user_id FROM tweet WHERE tweet_Id=${tweetId};`;
    const tweeterIdObj = await db.get(tweeterIdQuery);
    const tweeterId = tweeterIdObj.user_id;

    const checkUserQuery = `SELECT following_user_id FROM follower where follower_user_id=${userId} AND following_user_id=${tweeterId}`;

    const followingList = await db.get(checkUserQuery);

    if (followingList === undefined || followingList === []) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesQuery = `
        SELECT user.username as name
        FROM user INNER JOIN  like 
        ON user.user_id = like.user_id 
        WHERE like.tweet_id=${tweetId};
        `;
      const likeNamesList = await db.all(likesQuery);
      response.send({ likes: [...likeNamesList.map((each) => each.name)] });
    }
  }
);

// api 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);
    const userId = usersList.user_id;

    // check following

    const tweeterIdQuery = `SELECT user_id FROM tweet WHERE tweet_Id=${tweetId};`;
    const tweeterIdObj = await db.get(tweeterIdQuery);
    const tweeterId = tweeterIdObj.user_id;

    const checkUserQuery = `SELECT following_user_id FROM follower where follower_user_id=${userId} AND following_user_id=${tweeterId}`;

    const followingList = await db.get(checkUserQuery);

    if (followingList === undefined || followingList === []) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const resultQuery = `SELECT user.name as name,reply.reply as reply
        FROM reply INNER JOIN user 
        ON user.user_id = reply.user_id
        WHERE reply.tweet_id=${tweetId}`;
      const resultList = await db.all(resultQuery);
      response.send({ replies: resultList });
    }
  }
);

// api 9

app.get(
  "/user/tweets/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);
    const userId = usersList.user_id;
    const tweetsDetailsQuery = `
        SELECT count(like.tweet_id) as likes,count(reply.tweet_id) as replies,tweet.tweet as tweet,tweet.date_time as dateTime
        FROM ( user INNER JOIN tweet ON user.user_id=tweet.user_id)
          as T 
          INNER JOIN reply ON T.tweet_id=reply.tweet_id 
          INNER JOIN like ON like.tweet_id=tweet.tweet_id
        WHERE user.user_id=${userId}
        ;
        `;

    const tweetDetailsList = await db.all(tweetsDetailsQuery);

    response.send(tweetDetailsList);
  }
);

//api 10
app.post(
  "/user/tweets/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const { tweet } = request.headers;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);

    const userId = usersList.user_id;
    const date = new Date();
    console.log(date);
    const addTweet = `INSERT INTO tweet(tweet,user_id,date_time) VALUES(
        '${tweet}',
        ${userId},
        '${date}'
        );`;
    const dbResponse = await db.run(addTweet);
    response.send("Created a Tweet");
  }
);

app.delete(
  "/tweets/:tweetId/",
  authenticationMiddleWare,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const feedQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const usersList = await db.get(feedQuery);
    const userId = usersList.user_id;

    const tweeterIdQuery = `SELECT user_id FROM tweet WHERE tweet_Id=${tweetId};`;
    const tweeterIdObj = await db.get(tweeterIdQuery);
    const tweeterId = tweeterIdObj.user_id;

    if (userId === tweetId) {
      const deleteQuery = `
    DELETE FROM
        tweet
    WHERE
        tweet_id = ${tweetId};`;
      const dbResponse = await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
