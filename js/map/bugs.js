// bug 错因库：约 40 条系统性计算错因，按知识性(knowledge)/技能性(skill)/策略性(strategy)三分。
// 纯声明，不含任何逻辑。题模的 bugs 字段引用这里的 id；错题本按 bugId 出变式。
// 详见 docs/superpowers/specs/2026-07-10-calc-mastery-v3-design.md 第 3 节。
//
// family 释义：
// - knowledge：概念/规则本身没记牢或记错（例如小数点定位规则、符号法则）
// - skill：规则会背，但执行时手滑/漏步（例如漏乘一项、抄错数字）
// - strategy：判断题目该用什么方法时选错、走了弯路或误用捷径

const BUGS_RAW = [
  // —— 整数：进位链、退位链、部分积错位、试商 ——
  {
    id: 'int.carry_chain',
    family: 'skill',
    label: '连续进位断链',
    diagnose: '算到中间一位忘了把上一位进的 1 加上，后面的位又照旧算',
    explain: '从个位开始，每一位算完先问自己"这位有没有进位要带到下一位"；验算时用估算对量级，或倒着再加一遍',
  },
  {
    id: 'int.borrow_chain',
    family: 'skill',
    label: '连续退位断链',
    diagnose: '被减数中间有一位不够减，向前借了 1，但借之后忘了把那一位再减 1',
    explain: '借位后先在被减数上把"借出去的那一位"标记减 1，再逐位算；被减数中间有 0 时要连续借位，借一次划一次',
  },
  {
    id: 'int.borrow_zero',
    family: 'knowledge',
    label: '退位时跳过中间的 0',
    diagnose: '被减数某一位是 0，不够借，孩子不知道要继续往前一位借',
    explain: '0 借不出就再往前一位借：把 0 变成 10 再借 1 出去，前面那位再减 1；可以先把 0 圈出来提醒自己',
  },
  {
    id: 'int.mult_partial_align',
    family: 'skill',
    label: '乘法部分积错位',
    diagnose: '用两位数乘的时候，十位上的那一步部分积没有往左错一位写',
    explain: '每一位数字去乘，得到的部分积要向左错开一位（对齐到对应数位）；写完可以用"个位数字相乘的末位"快速核对',
  },
  {
    id: 'int.mult_carry',
    family: 'skill',
    label: '乘法进位加漏',
    diagnose: '某一位乘完有进位，但下一位乘完忘了把进位加上',
    explain: '每算完一位乘法先把进位写在上方小格里，算下一位时先加这个进位再乘；用估算检查结果的位数是否合理',
  },
  {
    id: 'int.div_trial_quotient',
    family: 'strategy',
    label: '试商偏大或偏小',
    diagnose: '除法试商时凭感觉猜一个数，没有先用除数的近似值估一下范围',
    explain: '先把除数看成整十数估一个大概的商，再试乘验证；乘积比被除数大就调小，比被除数小太多就调大',
  },
  {
    id: 'int.div_bring_down',
    family: 'skill',
    label: '除法漏落位',
    diagnose: '竖式除法算完一位商，忘了把下一位数字落下来继续除',
    explain: '每求出一位商、算出余数后，立刻把被除数的下一位"拉下来"接在余数右边，再继续试商',
  },
  {
    id: 'int.remainder_meaning',
    family: 'knowledge',
    label: '余数比除数大却没继续除',
    diagnose: '算出的余数其实比除数还大，说明商小了，但孩子没有检查这一点就直接收尾',
    explain: '除完要检查一句话："余数一定要比除数小"；如果余数≥除数，商还要再加，继续除',
  },

  // —— 小数：定位乘/除、移位方向 ——
  {
    id: 'dec.point_mult',
    family: 'knowledge',
    label: '积的小数位数错',
    diagnose: '乘完忘了数两个因数一共几位小数',
    explain: '先按整数乘，再数两个因数的小数位数之和，从右往左点回去；用估算验证数量级',
  },
  {
    id: 'dec.point_div',
    family: 'knowledge',
    label: '商的小数点定位错',
    diagnose: '除数是小数时，被除数和除数没有同时扩大相同倍数就直接除',
    explain: '先把除数变成整数（小数点往右移几位），被除数的小数点也要往右移同样几位，位数不够用 0 补齐',
  },
  {
    id: 'dec.shift_direction',
    family: 'knowledge',
    label: '乘/除 10、100、1000 移位方向反了',
    diagnose: '乘以 10 的倍数该往右移小数点，孩子却往左移；除法反过来',
    explain: '记口诀"乘大右移，除大左移"：数变大（乘）小数点往右走，数变小（除）小数点往左走，移几位看有几个 0',
  },
  {
    id: 'dec.compare_length',
    family: 'knowledge',
    label: '按小数位数多少比大小',
    diagnose: '认为小数位数越多这个数就越大，比如觉得 0.9 比 0.85 小',
    explain: '比较小数要先看整数部分，再从左到右一位一位对齐比较，位数不够的用 0 补齐再比，不能只看"写了几位"',
  },
  {
    id: 'dec.zero_significance',
    family: 'knowledge',
    label: '误删或误加小数末尾的 0',
    diagnose: '化简小数时把小数点前面的 0 也删了，或者不清楚末尾 0 什么时候能去掉',
    explain: '小数末尾的 0 可以去掉不改变大小（如 0.50=0.5），但小数点前、中间的 0 和整数部分的 0 不能随便删',
  },

  // —— 分数：通分、约分漏约、带分数转换、除法未取倒数 ——
  {
    id: 'frac.common_denom_add',
    family: 'skill',
    label: '通分后忘记分子跟着变',
    diagnose: '找到公分母后只改了分母，分子还是原来没放大的那个数',
    explain: '分子分母要按同一个倍数一起放大：分母乘了几倍，分子也要乘几倍，通分后先检查分子分母比例是否和原分数相等',
  },
  {
    id: 'frac.reduce_cross',
    family: 'skill',
    label: '交叉约分漏约',
    diagnose: '分数乘法可以先约分再乘，孩子只约了同一个分数内部的，没检查对角线上能不能约',
    explain: '分数乘分数时，先看分子和另一个分数的分母有没有公因数，能约的先约掉再乘，最后再检查结果是否已是最简',
  },
  {
    id: 'frac.reduce_incomplete',
    family: 'skill',
    label: '约分没约到最简分数',
    diagnose: '只除以了一个公因数就停了，其实分子分母还能继续约',
    explain: '约分后再看一眼分子分母还有没有公因数（尤其是 2、3、5），一直约到只剩 1 为止；也可以直接找最大公因数一步到位',
  },
  {
    id: 'frac.mixed_to_improper',
    family: 'skill',
    label: '带分数转假分数算错',
    diagnose: '带分数化假分数时，整数部分乘分母后忘了加分子，或者乘错了分母',
    explain: '带分数转假分数口诀："分母乘整数，加上原分子，结果做分子，分母不变"，写完后可以估算一下这个假分数是不是比原带分数大一点',
  },
  {
    id: 'frac.improper_to_mixed',
    family: 'skill',
    label: '假分数转带分数商余算错',
    diagnose: '假分数化带分数时用分子除以分母，商和余数算错，或者忘了余数才是新分子',
    explain: '分子除以分母：商是整数部分，余数是新分子，分母不变；换算完用带分数乘回分母加分子，看是否等于原分子',
  },
  {
    id: 'frac.div_no_reciprocal',
    family: 'knowledge',
    label: '分数除法忘记取倒数',
    diagnose: '分数除以分数时直接把两个分数分别相乘，没有把除数变成倒数',
    explain: '分数除法口诀："除以一个数，等于乘这个数的倒数"：除号变乘号，后面的分数上下颠倒，再按乘法算',
  },
  {
    id: 'frac.addsub_diff_denom',
    family: 'knowledge',
    label: '异分母分数直接分子分母相加减',
    diagnose: '看到分母不一样，仍然把分子和分母各自相加减，跳过了通分这一步',
    explain: '异分母分数加减必须先通分成同分母，才能分子相加减、分母不变；同分母的分数才能直接加减分子',
  },
  {
    id: 'frac.mult_add_confuse',
    family: 'strategy',
    label: '分数乘法和加法法则混用',
    diagnose: '分数乘法时把分母也加起来，或者分数加法时把分子分母都相乘',
    explain: '记清两条分开的规则：加减法"分母不变、分子相加减"（同分母时），乘法"分子乘分子、分母乘分母"，先想清楚是哪种运算再套公式',
  },

  // —— 运算顺序：同级左到右、括号 ——
  {
    id: 'order.same_level',
    family: 'knowledge',
    label: '同级运算未从左到右',
    diagnose: '同一级的加减法或乘除法混在一起时，孩子按自己觉得顺眼的顺序算，而不是从左往右',
    explain: '没有括号时，加减法是同一级、乘除法是同一级，同一级内必须从左到右依次算，不能跳着算或先算后面的',
  },
  {
    id: 'order.level_confuse',
    family: 'knowledge',
    label: '先加减后乘除',
    diagnose: '算式里有加减也有乘除，孩子按书写顺序从左到右算，没有先算乘除',
    explain: '运算顺序口诀："先乘除，后加减"：不管乘除写在算式的哪个位置，都要先算出来，再做加减',
  },
  {
    id: 'paren.priority',
    family: 'knowledge',
    label: '有括号不先算括号内',
    diagnose: '算式里有小括号或中括号，孩子没有优先算括号里面的部分',
    explain: '括号里的内容永远最优先：先算小括号，再算中括号，最后按"先乘除后加减"处理括号外的部分',
  },
  {
    id: 'paren.sign',
    family: 'knowledge',
    label: '去括号不变号',
    diagnose: '括号前面是减号时，去掉括号后括号里的每一项应该都变号，孩子只让第一项变号或者都不变',
    explain: '括号前是"+"，去括号各项不变号；括号前是"−"，去括号后括号内每一项都要变号（加变减、减变加）',
  },
  {
    id: 'order.bracket_scope',
    family: 'skill',
    label: '中括号和小括号范围搞混',
    diagnose: '算式里同时有中括号和小括号时，孩子分不清哪个先算，或者漏算了某一层',
    explain: '带中括号的算式先算里层的小括号，再算外层的中括号，一层一层往外剥，可以用铅笔把每算完的一层划掉',
  },

  // —— 简算：分配漏乘、除法误分配、假简算、拆数补偿号错 ——
  {
    id: 'dist.partial',
    family: 'skill',
    label: '分配律漏乘一项',
    diagnose: '用乘法分配律展开括号时，只把外面的数乘了括号里的第一项，忘了乘第二项',
    explain: '分配律要"逐项都乘到"：a×(b+c)=a×b+a×c，展开后数一数项数有没有对应上，可以用手指点着每一项检查',
  },
  {
    id: 'dist.over_div',
    family: 'knowledge',
    label: '除法错误地分配到加减号两边',
    diagnose: '把 c÷(a+b) 当成分配律拆成 c÷a+c÷b 来算，忽略了这条规则只在被除数是和/差时才成立',
    explain: '除法分配律只在"被除数是和/差"时成立：(a+b)÷c = a÷c + b÷c 是对的，但反过来 c÷(a+b) 不能拆成 c÷a+c÷b',
  },
  {
    id: 'smart.fake',
    family: 'strategy',
    label: '把不能简算的算式当能简算',
    diagnose: '看到数字凑整或眼熟就套用简算公式，没有先判断这道题是否真的符合运算律',
    explain: '简算前先问自己："这符合哪条运算律？"把公式在草稿上写出来对照，数字对不上公式结构就不能硬套',
  },
  {
    id: 'smart.split_sign',
    family: 'skill',
    label: '拆数补偿时符号弄反',
    diagnose: '把一个数拆成整十数加减一个小数（如 99=100−1）后，后续计算里补偿的加减号弄反了',
    explain: '拆成"多减"要"加回来"，拆成"少加"要"减回去"：99×a 当成 100×a 算，因为多乘了 1 个 a，最后要减掉这个 a',
  },
  {
    id: 'smart.assoc_confuse',
    family: 'knowledge',
    label: '结合律与分配律用混',
    diagnose: '把改变运算顺序的结合律和展开括号的分配律搞混，套错了公式',
    explain: '结合律是同一种运算内换括号位置，如 (a+b)+c=a+(b+c)；分配律是乘法对加减法展开，如 a×(b+c)=ab+ac，先判断算式里有几种运算再选公式',
  },
  {
    id: 'smart.sub_property_sign',
    family: 'knowledge',
    label: '连续减/加时符号处理错',
    diagnose: '用减法性质 a−b−c=a−(b+c) 或反过来展开时，括号内符号该变的没变',
    explain: '"连续减去几个数，等于减去这几个数的和"：a−b−c=a−(b+c)；反过来去括号时，括号前是减号，里面每项都要变号',
  },
  {
    id: 'smart.benchmark_diff',
    family: 'strategy',
    label: '基准数法方向搞反',
    diagnose: '用基准数比较一组数据的和时，超过基准的记成负、不足基准的记成正，方向弄反了',
    explain: '选定基准数后，比基准多出来的部分记"+"，比基准少的部分记"−"，最后 (基准×个数) 再加减这些差值',
  },

  // —— 方程：移项不变号、两边除以字母、特殊位置变形 ——
  {
    id: 'eq.move_sign',
    family: 'knowledge',
    label: '移项不变号',
    diagnose: '把方程一边的项移到另一边时，忘了把这一项的加减号也跟着变',
    explain: '移项口诀："过河变号"：一项从等号一边移到另一边，加号变减号、减号变加号；也可以理解成两边同时加/减同一个数',
  },
  {
    id: 'eq.divide_by_coeff',
    family: 'skill',
    label: '两边除以系数时漏除一边',
    diagnose: '解 ax=b 型方程时，只把等号一边除以了 a，另一边忘了也除以 a',
    explain: '等式的性质：两边同时除以同一个不为 0 的数，等式仍成立——一定要两边都除，可以先在等号两边都画上"÷a"再算',
  },
  {
    id: 'eq.special_pos_sub',
    family: 'strategy',
    label: 'x 在减数位置时解法搞反',
    diagnose: 'a−x=b 这种 x 是减数的方程，孩子直接用 a−b 却搞错该等于 x 还是先移项弄反了角色',
    explain: '把 x 当成未知的减数：a−x=b 可以先变形成 x=a−b（减数=被减数−差），也可以两边同加 x 再同减 b 一步步推',
  },
  {
    id: 'eq.special_pos_div',
    family: 'strategy',
    label: 'x 在除数位置时解法搞反',
    diagnose: 'a÷x=b 这种 x 是除数的方程，孩子直接用 a÷b 但没意识到角色变了，容易和 x÷a=b 弄混',
    explain: '除数=被除数÷商，所以 a÷x=b 时 x=a÷b；先分清 x 到底是被除数、除数还是商，角色不同解法不同，别死记一个公式',
  },
  {
    id: 'eq.both_sides_x',
    family: 'strategy',
    label: '两边都有 x 时未先合并',
    diagnose: '方程两边都出现未知数 x，孩子没有先把 x 项合并到一边，就直接乱移项计算',
    explain: '两边都有 x 时，先把含 x 的项都移到一边、常数项都移到另一边（移项要变号），合并同类项后再解',
  },
  {
    id: 'eq.check_skip',
    family: 'strategy',
    label: '解完方程不代入检验',
    diagnose: '求出 x 的值后直接抄下答案，没有把这个值代回原方程验证等式是否成立',
    explain: '解方程最后一步要把求出的 x 代入原方程两边，分别算出结果，两边相等才说明做对了',
  },

  // —— 口算：进位遗忘、口诀窜行 ——
  {
    id: 'oral.carry_forget',
    family: 'skill',
    label: '口算加法忘记进位',
    diagnose: '两位数口算加法时，个位满十该往十位加 1，脑子里算了个位就忘了这个 1',
    explain: '口算前先在心里默念"个位够十就往前进一"，练习时可以用手指或小声说出进位数来强化这个习惯',
  },
  {
    id: 'oral.borrow_forget',
    family: 'skill',
    label: '口算减法忘记退位',
    diagnose: '个位不够减需要向十位借 1，孩子直接用大数减小数得到错误结果，没有真正退位',
    explain: '个位不够减时，先想"十位借 1 给个位变成十几"，同时十位要记得少了 1，两步都要做到才是真退位',
  },
  {
    id: 'oral.table_row_jump',
    family: 'knowledge',
    label: '乘法口诀窜行',
    diagnose: '背乘法口诀时把相邻两行的结果记混了，比如把"六七四十二"记成"六八四十二"',
    explain: '容易窜行的口诀（如六、七、八开头的）单独挑出来多练几遍，可以用手指按着口诀表逐行对齐着背，别几行一起串着背',
  },
  {
    id: 'oral.table_misread',
    family: 'skill',
    label: '乘法口诀取用错误的两个数',
    diagnose: '算 7×8 时脑子里蹦出的是别的口诀结果，看错了要相乘的两个数字',
    explain: '口算时先把两个因数在心里默读一遍，确认数字没看错，再想对应的口诀，速度可以先放慢换准确',
  },
];

export const BUGS = Object.fromEntries(BUGS_RAW.map((b) => [b.id, b]));

export const BUG_IDS = Object.keys(BUGS);

export function byFamily(family) {
  return BUG_IDS.map((id) => BUGS[id]).filter((b) => b.family === family);
}
