import { Navbar } from "@/components/layout/navbar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Target, Zap, ArrowUpRight } from "lucide-react";

export default function LeaderboardPage() {
  const hunters = [
    {
      id: 1,
      name: "Alex Rivers",
      rank: 1,
      points: 12450,
      earned: "$45,200",
      completed: 34,
      rating: 4.9,
      avatar: "/diverse-group-avatars.png",
    },
    {
      id: 2,
      name: "Sarah Chen",
      rank: 2,
      points: 11200,
      earned: "$38,150",
      completed: 28,
      rating: 5.0,
      avatar: "/pandoran-bioluminescent-forest.png",
    },
    {
      id: 3,
      name: "Jordan Smith",
      rank: 3,
      points: 9850,
      earned: "$32,900",
      completed: 25,
      rating: 4.8,
      avatar: "/diverse-group-avatars.png",
    },
    {
      id: 4,
      name: "Maria Garcia",
      rank: 4,
      points: 8600,
      earned: "$28,400",
      completed: 21,
      rating: 4.7,
      avatar: "/diverse-group-avatars.png",
    },
    {
      id: 5,
      name: "Kenji Sato",
      rank: 5,
      points: 7400,
      earned: "$24,100",
      completed: 19,
      rating: 4.9,
      avatar: "/diverse-group-avatars.png",
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="imd:container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-12 text-center">
          <Badge
            variant="outline"
            className="mb-4 border-primary/20 text-primary"
          >
            Hall of Fame
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">
            Global Leaderboard
          </h1>
          <p className="text-muted-foreground">
            The world's top contributors solving the hardest challenges.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {hunters.slice(0, 3).map((hunter) => (
            <Card
              key={hunter.id}
              className={`relative overflow-hidden ${
                hunter.rank === 1
                  ? "border-primary ring-1 ring-primary/20 shadow-xl shadow-primary/10"
                  : ""
              }`}
            >
              {hunter.rank === 1 && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-bl-lg">
                  Top Hunter
                </div>
              )}
              <CardContent className="pt-8 text-center">
                <div className="relative inline-block mb-4">
                  <Avatar
                    className={`h-20 w-20 border-4 ${
                      hunter.rank === 1 ? "border-primary" : "border-muted"
                    }`}
                  >
                    <AvatarImage
  src={hunter.avatar || "/placeholder.svg"}
  alt={`${hunter.name} avatar`}
/>
                    <AvatarFallback>{"None"}</AvatarFallback>
                  </Avatar>
                  <div
                    className={`absolute -bottom-2 -right-2 h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      hunter.rank === 1
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    #{hunter.rank}
                  </div>
                </div>
                <h3 className="text-lg font-bold mb-1">{hunter.name}</h3>
                <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-4">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span>{hunter.rating}</span>
                  <span className="mx-1">•</span>
                  <span>{hunter.completed} Bounties</span>
                </div>
                <div className="text-2xl font-black text-primary">
                  {hunter.earned}
                </div>
                <p className="text-[10px] uppercase tracking-tighter text-muted-foreground">
                  Total Earnings
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" /> Active Standings
            </CardTitle>
            <CardDescription>
              Rankings based on total points and reputation
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {hunters.map((hunter) => (
                <div
                  key={hunter.id}
                  className="flex items-center p-4 hover:bg-muted/30 transition-colors gap-4"
                >
                  <div className="w-8 text-center font-mono font-bold text-muted-foreground">
                    #{hunter.rank}
                  </div>
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage
  src={hunter.avatar || "/placeholder.svg"}
  alt={`${hunter.name} avatar`}
/>
                    <AvatarFallback>{"None"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-bold leading-none">{hunter.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-primary" /> {hunter.points}{" "}
                        pts
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" /> {hunter.completed} Solved
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{hunter.earned}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      USD EQUIVALENT
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
