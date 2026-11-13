export function repoDoBlog(): { owner: string; repo: string } {
  return {
    owner: process.env.BLOG_REPO_OWNER ?? 'PiluVitu',
    repo: process.env.BLOG_REPO_NAME ?? 'piluvitu-blog',
  }
}
