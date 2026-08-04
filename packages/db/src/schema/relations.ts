import { relations } from 'drizzle-orm'
import { user } from './auth'
import { restaurants, savedPlaces } from './discovery'
import { rankings, vibeNotes } from './ranking'
import { neighborhoods } from './reference'
import { follows, userBlocks } from './social'

// Relations power Drizzle's relational queries, which fetch related rows in a
// single round trip — the primary tool for the "always prevent N+1" rule. Every
// feed/list read in the API uses these instead of looping queries.

export const userRelations = relations(user, ({ one, many }) => ({
  neighborhood: one(neighborhoods, {
    fields: [user.neighborhoodId],
    references: [neighborhoods.id],
  }),
  rankings: many(rankings),
  vibeNotes: many(vibeNotes),
  savedPlaces: many(savedPlaces),
  // The social graph, disambiguated by relationName because both sides FK user.
  following: many(follows, { relationName: 'follower' }),
  followers: many(follows, { relationName: 'following' }),
  blocking: many(userBlocks, { relationName: 'blocker' }),
  blockedBy: many(userBlocks, { relationName: 'blocked' }),
}))

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(user, {
    fields: [follows.followerId],
    references: [user.id],
    relationName: 'follower',
  }),
  following: one(user, {
    fields: [follows.followingId],
    references: [user.id],
    relationName: 'following',
  }),
}))

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(user, {
    fields: [userBlocks.blockerId],
    references: [user.id],
    relationName: 'blocker',
  }),
  blocked: one(user, {
    fields: [userBlocks.blockedId],
    references: [user.id],
    relationName: 'blocked',
  }),
}))

export const neighborhoodsRelations = relations(neighborhoods, ({ many }) => ({
  restaurants: many(restaurants),
  users: many(user),
}))

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  neighborhood: one(neighborhoods, {
    fields: [restaurants.neighborhoodId],
    references: [neighborhoods.id],
  }),
  rankings: many(rankings),
  vibeNotes: many(vibeNotes),
  savedBy: many(savedPlaces),
}))

export const rankingsRelations = relations(rankings, ({ one }) => ({
  user: one(user, { fields: [rankings.userId], references: [user.id] }),
  restaurant: one(restaurants, {
    fields: [rankings.restaurantId],
    references: [restaurants.id],
  }),
}))

export const vibeNotesRelations = relations(vibeNotes, ({ one }) => ({
  user: one(user, { fields: [vibeNotes.userId], references: [user.id] }),
  restaurant: one(restaurants, {
    fields: [vibeNotes.restaurantId],
    references: [restaurants.id],
  }),
}))

export const savedPlacesRelations = relations(savedPlaces, ({ one }) => ({
  user: one(user, { fields: [savedPlaces.userId], references: [user.id] }),
  restaurant: one(restaurants, {
    fields: [savedPlaces.restaurantId],
    references: [restaurants.id],
  }),
}))
