'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface TravelSearchProps {
  isLoading?: boolean
}

const popularDestinations = [
  '東京', '京都', '大阪', '首爾', '曼谷',
  '新加坡', '巴黎', '紐約', '倫敦', '台北'
]

export function TravelSearch({ isLoading }: TravelSearchProps) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setIsSearching(true)
      router.push(`/search-results?location=${encodeURIComponent(query.trim())}`)
    }
  }

  const handleQuickSearch = (destination: string) => {
    setIsSearching(true)
    router.push(`/search-results?location=${encodeURIComponent(destination)}`)
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="輸入想去的地方，例如：東京、巴黎、紐約..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-14 text-lg bg-card border-border rounded-xl shadow-sm focus-visible:ring-primary"
            />
          </div>
          <Button 
            type="submit" 
            size="lg"
            disabled={!query.trim() || isLoading || isSearching}
            className="h-14 px-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSearching ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Search className="h-5 w-5 mr-2" />
            )}
            {isSearching ? '探索中...' : '探索'}
          </Button>
        </div>
      </form>

      <div className="mt-6">
        <p className="text-sm text-muted-foreground mb-3">熱門目的地：</p>
        <div className="flex flex-wrap gap-2">
          {popularDestinations.map((dest) => (
            <button
              key={dest}
              onClick={() => handleQuickSearch(dest)}
              disabled={isLoading || isSearching}
              className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-full transition-colors disabled:opacity-50"
            >
              {dest}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
