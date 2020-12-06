const express = require("express");
const { WebhookClient } = require("dialogflow-fulfillment");
const app = express();
const fetch = require("node-fetch");
const base64 = require("base-64");

let username = "";
let password = "";
let token = "";
let currentCategory = "";

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

async function requireLogin(agent) {
  if (token === "") {
    await sendMessage(agent, "Please sign in first.");
    return false;
  } else {
    return true;
  }
}

app.get("/", (req, res) => res.send("online"));
app.post("/", express.json(), (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  // Send the user's message to the messages box
  const query = agent.query;
  sendMessage(agent, query, true);

  const reqLogin = async () => requireLogin(agent);

  function welcome() {
    sendMessage(agent, "Hello! Sign in to start using the application.");
    console.log(ENDPOINT_URL);
  }

  async function login() {
    if (token === "") {
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
    } else {
      await sendMessage(agent, `You're already logged in, ${username}`);
    }
  }

  async function logout() {
    if (await reqLogin()) {
      await goToPage(`/`);
      token = "";
      await sendMessage(agent, `I've logged you out ${username}`);
    }
  }

  async function listCategories() {
    if (await reqLogin()) {
      const res = await fetch(`${ENDPOINT_URL}/categories`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-access-token": token,
        },
      });
      const categories = (await res.json()).categories;
      await sendMessage(agent, `The categories are ${categories.join(", ")}. Would you like to view one of these?`);
    }
  }

  async function showCategory() {
    if (await reqLogin()) {
      const cat = agent.parameters.categories;
      currentCategory = cat;
      await goToPage(`/${username}/${cat}`);

      const res = await fetch(`${ENDPOINT_URL}/products`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-access-token": token,
        },
      });
      const items = (await res.json()).products.filter((p) => p.category === currentCategory).map((p) => p.name);

      await sendMessage(agent, `The items in ${currentCategory} are ${items.join(", ")}`);
    }
  }

  async function homepage() {
    if (reqLogin()) {
      await goToPage(`${username}`);
      await sendMessage(agent, `Here's the homepage ${username}`);
    }
  }

  async function listCategoryTags() {
    if (reqLogin()) {
      const res = await fetch(`${ENDPOINT_URL}/categories/${currentCategory}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-access-token": token,
        },
      });
      const tags = (await res.json()).join(", ");
    }
  }

  let intentMap = new Map();
  intentMap.set("Default Welcome Intent", welcome);
  intentMap.set("Login", login);
  intentMap.set("Logout", logout);
  intentMap.set("List Categories", listCategories);
  intentMap.set("Show Category", showCategory);
  intentMap.set("Show Homepage", homepage);
  agent.handleRequest(intentMap);
});

app.listen(process.env.PORT || 8080);
