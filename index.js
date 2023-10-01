const core = require('@actions/core');
const github = require('@actions/github');
const request = require('request-promise-native');

try {
  const apiKey = process.env['TRELLO_API_KEY'];
  const apiToken = process.env['TRELLO_API_TOKEN'];
  const boardId = process.env['TRELLO_BOARD_ID'];
  const action = core.getInput('trello-action');

  switch (action) {
    case 'create_card_when_issue_opened':
      createCardWhenIssueOpen(apiKey, apiToken, boardId);
      break;
    case 'move_card_when_pull_request_opened':
      moveCardWhenPullRequestOpen(apiKey, apiToken, boardId);
      break;
    case 'move_card_when_pull_request_closed':
      moveCardWhenPullRequestClose(apiKey, apiToken, boardId);
      break;
    case 'add_member_to_card_when_assigned':
      addMemberToCardWhenAssigned(apiKey, apiToken, boardId);
      break;
    // case 'move_card_when_issue_closed':
    //   moveCardWhenIssueClosed(apiKey, apiToken);
    //   break;

  }
} catch (error) {
  core.setFailed(error.message);
}

function createCardWhenIssueOpen(apiKey, apiToken, boardId) {
  const listId = process.env['TRELLO_TODO_LIST_ID'];
  const issue = github.context.payload.issue;
  const number = issue.number;
  const title = issue.title;
  const description = issue.body;
  const url = issue.html_url;
  const assignees = issue.assignees.map(assignee => assignee.login);
  const issueLabelNames = issue.labels.map(label => label.name);

  getLabelsOfBoard(apiKey, apiToken, boardId).then(function (response) {
    const trelloLabels = response;
    const trelloLabelIds = [];

    issueLabelNames.forEach(function (issueLabelName) {
      trelloLabels.forEach(function (trelloLabel) {
        if (trelloLabel.name.toLowerCase() == issueLabelName.toLowerCase()) {
          trelloLabelIds.push(trelloLabel.id);
        }
      });
    });

    getMembersOfBoard(apiKey, apiToken, boardId).then(function (response) {
      const members = response;
      const memberIds = [];
      assignees.forEach(function (assignee) {
        members.forEach(function (member) {
          if (member.username.toLowerCase() == assignee.toLowerCase()) {
            memberIds.push(member.id)
          }
        });
      });
      const cardParams = {
        number: number, title: title, description: description, url: url, memberIds: memberIds.join(), labelIds: trelloLabelIds.join()
      }

      createCard(apiKey, apiToken, listId, cardParams).then(function (response) {
        console.dir(response);
      });
    });
  });
}

function moveCardWhenIssueClosed(apiKey, apiToken) {
  const departureListId = process.env['TRELLO_DEPARTURE_LIST_ID'];
  const destinationListId = process.env['TRELLO_DESTINATION_LIST_ID'];
  const issue = github.context.payload.issue;
  console.debug("issue: ");
  console.debug(issue);
  const issue_number = issue.number;

  getCardsOfList(apiKey, apiToken, departureListId).then(function (responce) {
    const cards = responce;
    let cardId;

    cards.some(function (card) {
      const card_issue_number = card.name.match(/#[0-9]+/)[0].slice(1);
      if (card_issue_number == issue_number) {
        cardId = card.id;
        return true;
      }
    });

    const cardParams = {
      destinationListId: destinationListId
    };

    if (cardId) {
      putCard(apiKey, apiToken, cardId, cardParams);
    } else {
      core.setFailed('Card not found');
    }
  })
}

async function moveCardWhenPullRequestOpen(apiKey, apiToken, boardId) {
  const departureListId = process.env['TRELLO_IN_PROGRESS_LIST_ID'];
  const destinationListId = process.env['TRELLO_DEBUGING_LIST_ID'];
  const pullRequest = github.context.payload.pull_request;
  const issueNumbers = pullRequest.body.match(/#[0-9]+/g) || [];

  if (issueNumbers.length === 0) {
    core.setOutput('No issue numbers found in pull request description.');
    return;
  }

  const members = await getMembersOfBoard(apiKey, apiToken, boardId);
  const reviewers = pullRequest.requested_reviewers.map(reviewer => reviewer.login);
  const additionalMemberIds = members.filter(member => reviewers.includes(member.username.toLowerCase())).map(member => member.id);

  const cards = await getCardsOfList(apiKey, apiToken, departureListId);
  for (const issueNumber of issueNumbers) {
    const card = cards.find(card => card.name.includes(`#${issueNumber}`));
    if (card) {
      const existingMemberIds = card.idMembers;
      const cardParams = {
        destinationListId: destinationListId,
        memberIds: existingMemberIds.concat(additionalMemberIds).join()
      }
      await putCard(apiKey, apiToken, card.id, cardParams);
      await addUrlSourceToCard(apiKey, apiToken, card.id, pullRequest.html_url);
    }
  }
}


function moveCardWhenPullRequestClose(apiKey, apiToken, boardId) {
  const departureListId = process.env['TRELLO_DEBUGING_LIST_ID'];
  const destinationListId = process.env['TRELLO_DONE_LIST_ID'];
  const pullRequest = github.context.payload.pull_request;
  const issue_numbers = pullRequest.body.match(/#[0-9]+/g) ?? [];
  const reviewers = pullRequest.requested_reviewers.map(reviewer => reviewer.login);

  if (issue_numbers.length === 0) {
    core.setOutput('No issue numbers found in pull request description.');
    return;
  }

  getMembersOfBoard(apiKey, apiToken, boardId).then(function (response) {
    const members = response;
    const additionalMemberIds = [];
    reviewers.forEach(function (reviewer) {
      members.forEach(function (member) {
        if (member.username.toLowerCase() == reviewer.toLowerCase()) {
          additionalMemberIds.push(member.id);
        }
      });
    });

    getCardsOfList(apiKey, apiToken, departureListId).then(function (response) {
      const cards = response;
      let existingMemberIds = [];

      issue_numbers.forEach(function (issue_number) {
        cards.some(function (card) {
          const card_issue_number = card.name.match(/#[0-9]+/)[0].slice(1);
          if (card_issue_number.toLowerCase() == issue_number.toLowerCase()) {
            const cardId = card.id;
            existingMemberIds = card.idMembers;

            const cardParams = {
              destinationListId: destinationListId,
              memberIds: existingMemberIds.concat(additionalMemberIds).join()
            }

            putCard(apiKey, apiToken, cardId, cardParams);

            return true;
          }
        });
      });
    });
  });
}

// Function to add yourself as a member to an existing card when assigned on GitHub
async function addMemberToCardWhenAssigned(apiKey, apiToken, boardId) {
  const issue = github.context.payload.issue;
  core.setOutput("issue", issue);
  const issueNumber = issue.number;
  const assignees = issue.assignees.map(assignee => assignee.login);

  // Define the Trello lists to search in order
  const trelloListsToSearch = [
    process.env['TRELLO_TODO_LIST_ID'],
    process.env['TRELLO_IN_PROGRESS_LIST_ID'],
    process.env['TRELLO_DEBUGING_LIST_ID']
    // Add more lists as needed
  ];

  const card = getCardOfLists(apiKey, apiToken, trelloListsToSearch, issueNumber);
  const members = await getMembersOfBoard(apiKey, apiToken, boardId);

  const existingMemberIds = card.idMembers;
  const newMemberIds = [];

  assignees.forEach(assigned => {
    members.forEach(member => {
      if (member.username.toLowerCase() == assigned.toLowerCase()
        && !card.idMembers.includes(member.id)) {
        newMemberIds.push(member.id);
      }
    });
  });

  if (newMemberIds.length === 0) {
    core.setOutput("board members", members);
    core.setOutput("assignees", assignees);
    core.setFailed('No new members to add to card.');
    return;
  }

  const cardParams = {
    memberIds: existingMemberIds.concat(newMemberIds).join()
  }

  putCard(apiKey, apiToken, card.id, cardParams);

  return true;
}

function getLabelsOfBoard(apiKey, apiToken, boardId) {
  return new Promise(function (resolve, reject) {
    request(`https://api.trello.com/1/boards/${boardId}/labels?key=${apiKey}&token=${apiToken}`)
      .then(function (body) {
        resolve(JSON.parse(body));
      })
      .catch(function (error) {
        reject(error);
      })
  });
}

function getMembersOfBoard(apiKey, apiToken, boardId) {
  return new Promise(function (resolve, reject) {
    request(`https://api.trello.com/1/boards/${boardId}/members?key=${apiKey}&token=${apiToken}`)
      .then(function (body) {
        resolve(JSON.parse(body));
      })
      .catch(function (error) {
        reject(error);
      })
  });
}

function getCardOfLists(apiKey, apiToken, listIds, issueNumber) {
  listIds.forEach(async id => {
    console.log("Seraching in list: " + id + " for issue: " + issueNumber);
    const cards = await getCardsOfList(apiKey, apiToken, id);
    cards.forEach(card => {
      if (card.name.includes(`#${issueNumber}`)) {
        return card;
      }
    });
  });

  core.setFailed('Card not found');
}

function getCardsOfList(apiKey, apiToken, listId) {
  return new Promise(function (resolve, reject) {
    request(`https://api.trello.com/1/lists/${listId}/cards?key=${apiKey}&token=${apiToken}`)
      .then(function (body) {
        resolve(JSON.parse(body));
      })
      .catch(function (error) {
        reject(error);
      })
  });
}

function createCard(apiKey, apiToken, listId, params) {
  const options = {
    method: 'POST',
    url: 'https://api.trello.com/1/cards',
    form: {
      'idList': listId,
      'keepFromSource': 'all',
      'key': apiKey,
      'token': apiToken,
      'name': `[#${params.number}] ${params.title}`,
      'desc': params.description,
      'urlSource': params.url,
      'idMembers': params.memberIds,
      'idLabels': params.labelIds
    },
    json: true
  }
  return new Promise(function (resolve, reject) {
    request(options)
      .then(function (body) {
        resolve(body);
      })
      .catch(function (error) {
        reject(error);
      })
  });
}

function putCard(apiKey, apiToken, cardId, params) {
  const options = {
    method: 'PUT',
    url: `https://api.trello.com/1/cards/${cardId}?key=${apiKey}&token=${apiToken}`,
    form: {
      'idList': params.destinationListId,
      'idMembers': params.memberIds,
    }
  }
  return new Promise(function (resolve, reject) {
    request(options)
      .then(function (body) {
        resolve(JSON.parse(body));
      })
      .catch(function (error) {
        reject(error);
      })
  });
}

function addUrlSourceToCard(apiKey, apiToken, cardId, url) {
  const options = {
    method: 'POST',
    url: `https://api.trello.com/1/cards/${cardId}/attachments?key=${apiKey}&token=${apiToken}`,
    form: {
      url: url
    }
  }
  return new Promise(function (resolve, reject) {
    request(options)
      .then(function (body) {
        resolve(JSON.parse(body));
      })
      .catch(function (error) {
        reject(error);
      })
  });
}
