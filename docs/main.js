function generatePost() {
  const client = document.getElementById('clientSelect').value;
  const input = document.getElementById('userInput').value;
  const output = document.getElementById('outputArea');

  // 仮の出力（将来はAPI連携へ）
  const mockOutput = `【${client}】の投稿案：
「${input}」というテーマで、以下のようなSNS投稿案が考えられます！

🌸 春の訪れを感じさせる新商品が登場！
✨ 今だけ限定キャンペーン実施中！

ぜひチェックしてくださいね！`;

  output.textContent = mockOutput;
}
