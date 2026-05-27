export default {
  async scheduled(event, env) {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/scheduler.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'bangbangmang-scheduler',
        },
        body: JSON.stringify({ ref: env.GITHUB_BRANCH || 'master' }),
      }
    );

    console.log(`Trigger scheduler: ${res.status} ${res.statusText}`);
    return new Response('OK');
  },

  async fetch(request, env) {
    return new Response('bangbangmang scheduler', { status: 200 });
  },
};
