import { Card } from '@/components/ui/card'
import { DataArticle, DataItem } from '@/hooks/usefetch-data'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'

export async function useFetchData() {
  const dados = await axios.get<DataItem>(
    'https://dev.to/api/articles?username=piluvitu',
  )

  return dados.data
}

export async function ArticleCard() {
  const articles = await useFetchData()

  return (
    <>
      {articles.map((article: DataArticle) => (
        <Card
          key={article.id}
          className="flex h-fit flex-col justify-between gap-4 p-5 md:flex-row xl:h-fit xl:w-80 xl:flex-col"
        >
          <section className="flex flex-col justify-center gap-4">
            <h3>{article.title}</h3>
            <p className="text-muted-foreground">
              Tempo de leitura: {article.reading_time_minutes}min
            </p>
          </section>
          <div className="relative my-auto flex h-44 w-72 flex-shrink-0 overflow-hidden rounded-lg border xl:mx-auto">
            {article.social_image && (
              <Link
                href={article.canonical_url}
                rel="noopener noreferrer nofollow"
                target="_blank"
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
