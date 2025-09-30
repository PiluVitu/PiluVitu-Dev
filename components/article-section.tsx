"use client";

import { DataArticle, UseArticleData } from "@/hooks/useArticleData";
import { ArticleCard } from "./article-card";

export function ArticleSection() {
  const { data } = UseArticleData();

  return (
    <>
      {data?.map((article: DataArticle) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </>
  );
}
