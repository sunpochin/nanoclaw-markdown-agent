import { writeNoteToMarkdown } from './src/markdown-service.js';

async function test() {
  const multilineNote = `今天學習了 JavaScript 的特性：\n1. 閉包是用來保存狀態的\n2. 原型鏈是用來實現繼承的\n3. 異步是透過事件循環實現的`;
  console.log("📥 準備寫入多行筆記：");
  console.log(multilineNote);
  
  await writeNoteToMarkdown(multilineNote);
  console.log("\n🎉 寫入完成！");
}

test();
