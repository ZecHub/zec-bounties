const request = require('supertest');
const app = require('../app'); // Adjust the path to your app entry point
const prisma = require('../prisma'); // Adjust the path to your Prisma client
const { createSyntheticUser, createSyntheticBounty, createSyntheticSubmission } = require('./test-utils'); // Adjust the path to your test utilities

describe('Onboarding and Work Submission', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should complete Hunter onboarding and recognize the new role', async () => {
    const user = await createSyntheticUser();
    const response = await request(app)
      .post('/onboarding/hunter')
      .send(user);

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('hunter');
  });

  it('should accept a work submission from its assigned contributor', async () => {
    const user = await createSyntheticUser({ role: 'hunter' });
    const bounty = await createSyntheticBounty();
    const submission = await createSyntheticSubmission({ userId: user.id, bountyId: bounty.id });

    const response = await request(app)
      .post(`/bounty/${bounty.id}/submit`)
      .send(submission)
      .set('Authorization', `Bearer ${user.token}`);

    expect(response.status).toBe(200);
    expect(response.body.submission.status).toBe('accepted');
  });

  it('should reject submission before approval', async () => {
    const user = await createSyntheticUser({ role: 'hunter' });
    const bounty = await createSyntheticBounty();
    const submission = await createSyntheticSubmission({ userId: user.id, bountyId: bounty.id });

    const response = await request(app)
      .post(`/bounty/${bounty.id}/submit`)
      .send(submission)
      .set('Authorization', `Bearer ${user.token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Submission rejected before approval');
  });

  it('should reject submission by an unrelated contributor', async () => {
    const user1 = await createSyntheticUser({ role: 'hunter' });
    const user2 = await createSyntheticUser({ role: 'submitter' });
    const bounty = await createSyntheticBounty();
    const submission = await createSyntheticSubmission({ userId: user2.id, bountyId: bounty.id });

    const response = await request(app)
      .post(`/bounty/${bounty.id}/submit`)
      .send(submission)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Submission rejected by an unrelated contributor');
  });
});