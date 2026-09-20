import type { Meta, StoryObj } from '@storybook/nextjs'
import { Lobby } from "./lobby"

const meta = {
    title: "Componets/Lobby",
    component: Lobby,
} satisfies Meta<typeof Lobby>

export default meta

type Story = StoryObj<typeof meta>

export const Primary: Story = {
    args: {}
}