type Point = {x: number; y: number};

export async function viewportCenter(): Promise<Point> {
  const viewport = await miro.board.viewport.get();
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };
}

export async function selectCreated(
  ...items: Array<{id: string}>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const ids = items.map((item) => item.id);
  try {
    await miro.board.select({id: ids.length === 1 ? ids[0] : ids});
  } catch (error) {
    console.error('Failed to select created item', error);
  }
}
