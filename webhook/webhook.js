const express = require("express");
const { WebhookClient } = require("dialogflow-fulfillment");
const app = express();
const fetch = require("node-fetch");
const base64 = require("base-64");

let username = "";
let password = "";
let token = "";

const USE_LOCAL_ENDPOINT = false;
// set this flag to true if you want to use a local endpoint
// set this flag to false if you want to use the online endpoint
let ENDPOINT_URL = "";
if (USE_LOCAL_ENDPOINT) {
  ENDPOINT_URL = "http://127.0.0.1:5000";
} else {
  ENDPOINT_URL = "https://mysqlcs639.cs.wisc.edu";
}

async function getToken() {
  let request = {
    method: "GET",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + base64.encode(username + ":" + password) },
    redirect: "follow",
  };

  const serverReturn = await fetch(ENDPOINT_URL + "/login", request);
  const serverResponse = await serverReturn.json();
  if (serverResponse.token) {
    token = serverResponse.token;
    return token;
  } else {
    return false;
  }
}

async function goToPage(page) {
  let request = {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-access-token": token },
    body: JSON.stringify({
      back: false,
      dialogflowUpdated: true,
      page: page,
    }),
  };

  await fetch(ENDPOINT_URL + "/application", request);
}

async function sendMessage(agent, msg, isUser = false) {
  let body = {
    isUser: isUser,
    text: msg,
    date: new Date().toISOString(),
  };

  let request = {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-token": token },
    body: JSON.stringify(body),
  };

  await fetch(ENDPOINT_URL + `/application/messages`, request);
  if (!isUser) agent.add(msg);
}

app.get("/", (req, res) => res.send("online"));
app.post("/", express.json(), (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  // Send the user's message to the messages box
  const query = agent.query;
  sendMessage(agent, query, true);

  function welcome() {
    sendMessage(agent, "Webhook works!");
    console.log(ENDPOINT_URL);
  }

  async function login() {
    username = agent.parameters.username;
    password = agent.parameters.password;
    if (await getToken()) {
      // Clear all previous messages
      fetch(ENDPOINT_URL + "/application/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-access-token": token },
      });
      // Send message and go to home page
      await sendMessage(agent, `Logging you in now ${username}!`, false);
      await goToPage(`/${username}`);
    } else {
      await sendMessage(agent, `Sorry ${username}, that password didn't work. Please try again.`);
    }
  }

  async function logout() {
    await goToPage(`/`);
    token = "";
    await sendMessage(agent, `I've logged you out ${username}`);
  }

  async function listCategories() {
    await sendMessage(
      agent,
      `The categories are Hats, Sweatshirts, Plushes, Leggings, Tees, and Bottoms. \
                              Would you like to view one of these?`
    );
  }

  async function categories() {
    const cat = agent.parameters.categories;
    await goToPage(`/${username}/${cat}`);
    await sendMessage(agent, `Here are our ${cat}.`);
  }

  let intentMap = new Map();
  intentMap.set("Default Welcome Intent", welcome);
  intentMap.set("Login", login);
  intentMap.set("Logout", logout);
  intentMap.set("List Categories", listCategories);
  intentMap.set("Categories", categories);
  agent.handleRequest(intentMap);
});

app.listen(process.env.PORT || 8080);
