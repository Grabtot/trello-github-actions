const assert = require('assert');
const sinon = require('sinon');

describe('moveCardWhenPullRequestOpen', function () {
  let apiKey, apiToken, boardId, departureListId, destinationListId, pullRequest, issueNumbers, members, reviewers, additionalMemberIds, cards;

  beforeEach(function () {
    apiKey = 'testApiKey';
    apiToken = 'testApiToken';
    boardId = 'testBoardId';
    departureListId = 'testDepartureListId';
    destinationListId = 'testDestinationListId';
    pullRequest = {
      body: 'This pull request fixes #1 and #2',
      requested_reviewers: [
        { login: 'user1' },
        { login: 'user2' }
      ],
      html_url: 'https://github.com/user/repo/pull/1'
    };
    issueNumbers = ['1', '2'];
    members = [
      { id: 'member1', username: 'user1' },
      { id: 'member2', username: 'user2' },
      { id: 'member3', username: 'user3' }
    ];
    reviewers = ['user1', 'user2'];
    additionalMemberIds = ['member1', 'member2'];
    cards = [
      { id: 'card1', name: 'Fix #1', idMembers: ['member1'] },
      { id: 'card2', name: 'Fix #2', idMembers: ['member2'] },
      { id: 'card3', name: 'Fix #3', idMembers: [] }
    ];
  });

  it('should move cards and add reviewers as members', async function () {
    const getMembersOfBoardStub = sinon.stub().resolves(members);
    const getCardsOfListStub = sinon.stub().resolves(cards);
    const putCardStub = sinon.stub().resolves();
    const addUrlSourceToCardStub = sinon.stub().resolves();
    const coreSetOutputStub = sinon.stub();

    const expectedCardParams1 = {
      destinationListId: destinationListId,
      memberIds: ['member1', 'member2'].join()
    };
    const expectedCardParams2 = {
      destinationListId: destinationListId,
      memberIds: ['member1', 'member2'].join()
    };

    const expectedCardsToMove = [
      { id: 'card1', name: 'Fix #1', idMembers: ['member1', 'member2'] },
      { id: 'card2', name: 'Fix #2', idMembers: ['member1', 'member2'] }
    ];

    const expectedUrlSource = 'https://github.com/user/repo/pull/1';

    const moveCardWhenPullRequestOpen = require('./index').moveCardWhenPullRequestOpen;
    await moveCardWhenPullRequestOpen(apiKey, apiToken, boardId);

    sinon.assert.calledOnce(getMembersOfBoardStub);
    sinon.assert.calledWith(getMembersOfBoardStub, apiKey, apiToken, boardId);

    sinon.assert.calledOnce(getCardsOfListStub);
    sinon.assert.calledWith(getCardsOfListStub, apiKey, apiToken, departureListId);

    sinon.assert.calledTwice(putCardStub);
    sinon.assert.calledWith(putCardStub, apiKey, apiToken, 'card1', expectedCardParams1);
    sinon.assert.calledWith(putCardStub, apiKey, apiToken, 'card2', expectedCardParams2);

    sinon.assert.calledTwice(addUrlSourceToCardStub);
    sinon.assert.calledWith(addUrlSourceToCardStub, apiKey, apiToken, 'card1', expectedUrlSource);
    sinon.assert.calledWith(addUrlSourceToCardStub, apiKey, apiToken, 'card2', expectedUrlSource);

    sinon.assert.notCalled(coreSetOutputStub);
  });

  it('should not move cards or add reviewers as members if no issue numbers are found', async function () {
    pullRequest.body = 'This pull request has no issue numbers';
    issueNumbers = [];

    const getMembersOfBoardStub = sinon.stub().resolves(members);
    const getCardsOfListStub = sinon.stub().resolves(cards);
    const putCardStub = sinon.stub().resolves();
    const addUrlSourceToCardStub = sinon.stub().resolves();
    const coreSetOutputStub = sinon.stub();

    const moveCardWhenPullRequestOpen = require('./index').moveCardWhenPullRequestOpen;
    await moveCardWhenPullRequestOpen(apiKey, apiToken, boardId, getMembersOfBoardStub, getCardsOfListStub, putCardStub, addUrlSourceToCardStub, coreSetOutputStub);

    sinon.assert.calledOnce(getMembersOfBoardStub);
    sinon.assert.calledWith(getMembersOfBoardStub, apiKey, apiToken, boardId);

    sinon.assert.notCalled(getCardsOfListStub);
    sinon.assert.notCalled(putCardStub);
    sinon.assert.notCalled(addUrlSourceToCardStub);

    sinon.assert.calledOnce(coreSetOutputStub);
    sinon.assert.calledWith(coreSetOutputStub, 'No issue numbers found in pull request description.');
  });

  it('should not move cards or add reviewers as members if no cards are found', async function () {
    cards = [];

    const getMembersOfBoardStub = sinon.stub().resolves(members);
    const getCardsOfListStub = sinon.stub().resolves(cards);
    const putCardStub = sinon.stub().resolves();
    const addUrlSourceToCardStub = sinon.stub().resolves();
    const coreSetOutputStub = sinon.stub();

    const moveCardWhenPullRequestOpen = require('./index').moveCardWhenPullRequestOpen;
    await moveCardWhenPullRequestOpen(apiKey, apiToken, boardId, getMembersOfBoardStub, getCardsOfListStub, putCardStub, addUrlSourceToCardStub, coreSetOutputStub);

    sinon.assert.calledOnce(getMembersOfBoardStub);
    sinon.assert.calledWith(getMembersOfBoardStub, apiKey, apiToken, boardId);

    sinon.assert.calledOnce(getCardsOfListStub);
    sinon.assert.calledWith(getCardsOfListStub, apiKey, apiToken, departureListId);

    sinon.assert.notCalled(putCardStub);
    sinon.assert.notCalled(addUrlSourceToCardStub);

    sinon.assert.notCalled(coreSetOutputStub);
  });
});