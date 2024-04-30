'use client'

import { Card } from '@/components/ui/card'
import { DataArticle } from '@/hooks/usefetch-data'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function ArticleCard() {
  const [articles, setArticles] = useState<DataArticle[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await axios.get(
        'https://dev.to/api/articles?username=piluvitu',
      )

      setArticles(data)
    }

    fetchData()
  }, [])

  return (
    <>
      {articles.map((article: DataArticle) => (
        <Card
          key={article.id}
          className="flex h-fit  flex-col justify-between gap-4 p-5 md:flex-row xl:h-fit xl:w-80 xl:flex-col"
        >
          <section className="flex flex-col justify-center gap-4">
            <h3 className="line-clamp-2 max-h-14 text-xl">{article.title}</h3>
            <p className="text-muted-foreground">
              Tempo de leitura: {article.reading_time_minutes}min
            </p>
            <div className="flex items-center justify-between">
              <p className="flex items-center text-muted-foreground">
                👍 {article.positive_reactions_count}
              </p>
              <p className="flex items-center text-muted-foreground">
                💬 {article.comments_count}
              </p>
            </div>
          </section>
          <div className="relative my-auto flex h-44 w-72 flex-shrink-0 overflow-hidden rounded-lg border xl:mx-auto">
            {article.social_image && (
              <Link
                href={article.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <Image
                  alt="DevHatt"
                  loading="lazy"
                  width={288}
                  height={144}
                  src={article.social_image}
                  className=" object-cover transition-transform hover:scale-x-110"
                />
              </Link>
            )}
          </div>
        </Card>
      ))}
    </>
  )
}
