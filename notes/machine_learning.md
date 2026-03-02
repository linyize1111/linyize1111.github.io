---
title: Machine Learning

---

# Machine Learning
---
[TOC]

## ML Introduction: 
---
### - Output space
1. classification

3. regression

4. clustering

### - Learning with Different Protocol
1. batch: duck feeding
2. online: passive sequential
3. active: 'question asking'(sequentially)

...and more

### - Input space
1. conctrete
2. row 
3. abstract

### - Training Methods:
1. Supervised Learning 
-To learn a function that, given a sample of data and desired outputs, best approximates the relationship between input and output observable in the data

- Classification
- Regression

>-Ex:Decision Tree、Random Forest、KNN、Logistic/Logit/Linear Regression、SVM

2. Unsupervised Learning
-It does not have labeled outputs, so its goal is to infer the natural structure present within a set of data points.we wish to learn the inherent structure of our data without using explicitly-provided labels.

- Clustering
>-EX:K-means、Hierarchical Clustering
- Association
>-EX:Apriori

3. Semi-surpervised Learning
-Leverage unlabeled data to avoid  'expensive' labeling

4. Reinforcement Learning
-Reward shaping
>-EX:Markov Decision Process、Q Learning 

## Machine Learning、Data Mining and Statistics
---
| Maching learning | Data Mining |Statistics|
| :----------- | :------------- | :---------- |
|use data to compute hypothesis g that approximate target | use (huge) data to find property that is interesting|use data to make inference about an unknown process|
- if 'interesting property' same as 'hypothesis that approximate target'
-- ML = DM
- if 'interesting property' related to 'hypothesis that approximate target'
-- ML&DM can help each oher(often,but not always)
- traditional DM also focuses on efficient computation in large database
- statistics can be used to achieve ML
-- focus on math provable results with math assumptions,and care less about computation

## Key Essence of ML
---
machine learning:
 improving some performance measure with experience computed from data.

1. exists some 'underlying pattern' to be learn
    --- so 'performance measure' can be improved
2. but no programmable(easy) definition
    --- so 'ML' is needed
3. somehow there is data about the pattern 
    --- so 'ML' has some 'inputs' to learn from

## Feasibility of learning
---
### - Hoeffding's inequality
$$P(\midμ-\nu\mid>\epsilon)≤2exp(-2\epsilon^2N)$$
> $\mu$:probability
> $\nu$:fraction(known)
> $\epsilon$:tolerance

- valid for all N and $\epsilon$
- does not depend on $\mu$,no need to 'know' $\mu$
- larger size N or looser gap $\epsilon$
=> higher probability for '$\nu\approx \mu$'

if in larger N,can infer unknown $\mu$ by known $\nu$
### - Bound of BAD Data
BAD data for many $h$
><=> no 'freedom of choise' by $A$
><=> there exists some $h$ such that $E_{out}$($h$) and $E_{in}$($h$) far away

![](https://i.imgur.com/8bCYJhB.png)
### - The Statistical Learning Flow 
(in-sample and out-sample data in the same distribution)
- if $\mid H\mid$=$M$ finite,$N$ large enough, for whatever $g$ picked by $A$, $E_{out}$($g$) $\approx$ $E_{in}$($g$)
  - if $A$ finds one g with $E_{in}$($g$) $\approx 0$
  PAC guarantee for $E_{out}$($g$) $\approx 0$ => learning possible


|           | can we make sure that $E_{out}$($g$) is close enough to $E_{in}$($g$)? | can we make $E_{in}$($g$) small enough? |
|:---------:| :-------- | :-------- |
| small M   | Yes! P[BAD]$\le2M\cdot$exp(...) | No!,too few choises | 
| big M     | NO!,P[BAD]$\le2M\cdot$exp(...) | Yes!,many choices     |

- if $\mid H\mid$=$M$ infinite
![](https://i.imgur.com/pUQAYzL.png)

(1)using growth function $m_H$ to replace $M$
![](https://i.imgur.com/MielXvs.png)
if all the situations can be separated,we named the situations 'Shatter',on the other hand we call them 'Shatter fail',and the start point is 'Break point'

by using the break points and Hoeffding's inequality, we can derive the inquality:

$$P[∃h∈H_{s.t.} |E_{in}(h)−E_{out}(h)|>ε]≤4m_H(2N)exp(−ε^2N/8)$$

And the 'Growth Function' $m_H$(2N) is related to N of Data 

(2)
a.More on Growth function
![](https://i.imgur.com/4QL7NPV.png)

b.using VC bound
![](https://i.imgur.com/Ukk7F4e.jpg)

=>learning possible

### - VC Dimension：$d_{VC}=BreakPoint−1$
$d_{VC}$ has special meaning in math,$d_{VC} \approx$ number of adjustable variables

![](https://i.imgur.com/R9w46D6.png)

![](https://i.imgur.com/KV9FK6S.png)

**$N \approx 10d_{vc}$ often enough!!**
## Noise and Error
---
>Error -> affect 'ideal' target
### - Algorithm Error measure
![](https://i.imgur.com/zIEbOCk.png)
user-dependent => plausible of friendly

### - Weighted Classification

|          |          |   h(x)   |          |
| -------- | :------: | :------: | :------: |
|          |          | **+1**   | **-1**   |
|    y     | **+1**   | 0        | ==1==    |
|          | **-1**   | ==1000== | 0        |

->copy the data which have lower weigth(X1000)



## The Learning Problem
---
### - Basic Notations
>- input: x ∈ *X*(customer application)
>- output: y ∈ *Y*(good/bad after approving credit card)
>- unknown pattern to be learned <=> target function:
>-- f: *X$\rightarrow$Y* (ideal credit approval formla)
>- data<=>training examples:
>-- *D* (historical record of bank)={($x_1,y_1$),($x_2,y_2$),($x_3,y_3$),...,($x_n,y_n$)}
>- hypothesis<=>skill with hopefully good performance:
>-- g: *X$\rightarrow$Y* ('learned' formula to be used)


### - The Learning Model:
![](https://i.imgur.com/204T5Ny.png)

## A simple hypothesis set: the 'Perceptron'(answer yes/no
### - What is a Perceptron?
For x=($x_1,x_2,...,x_d$)'features of customer',compute a weighted 'score' and
> - approve credit if $\sum\limits_{i=1}^dw_ix_i>$threshold
> - deny credit if $\sum\limits_{i=1}^dw_ix_i<$threshold

*y*:{+1(good),-1(bad)},0 ignored-linear formla h$\in H$ are
> - h(x)=sign(($\sum\limits_{i=1}^dw_ix_i$)-threshold)
### - Vector Form of Perceptron Hypothesis
> h(x)
> =sign(($\sum\limits_{i=1}^dw_ix_i$)-threshold)
> =sign(($\sum\limits_{i=1}^dw_ix_i$)+(-threshold)$\cdot$(+1)) => threshold$\rightarrow w_0$ , (+1)$\rightarrow x_0$
> =sign(($\sum\limits_{i=0}^dw_ix_i$)) => i=0
> =sign($w^Tx$) - **inner product of two vectors**
### - Perceptrons in $\mathbb{R}^2$
> h(x)=sign($w_0+w_1x_1+w_2x_2$) $\rightarrow$ 'a line'
![](https://i.imgur.com/TTeavAj.png)
**perceptrons <=> linear(binary)classifiers**
### - Select g from $H$
$H$=all possible perceptrons,g=?
> - want:g$\approx$f(hard when f unknown)
> - almost necessary:g$\approx$f on $D$,ideally g($x_n$)=f($x_n$)=$y_n$
> - difficult:$H$ is of infinite size
> - idea:start from some $g_0$,and 'correct'its mistakes on $D$
###### will represent $g_0$ by its weight vector $w_0$

### - Perceptron Learning Algorithm(PLA)
###### Start from some $w_0$ (say,0),and 'correct' its mistakes on $D$
![](https://i.imgur.com/8kJe0sK.png)
###### Inner product increasing $\rightarrow$ angle decreasing
![](https://i.imgur.com/ciH2G41.png)
###### Limited length growthing
![](https://i.imgur.com/Yzftz9b.png)

### - More about PLA
Guarantee:
> as long as liner separable and correct by mistake
> - inner product of &w_f& and $w_t$ grows fast;length of $w_t$ grows slowly
> - PLA 'lines' are more and more aligned with $w_f$ => halts

Pros:
> simple to implement,fast,works in any dimension *d*

Cons:
> - 'assumes' linear separable $D$ to halt
    > --property unknown in advance(no need PLA if we know $w_f$)
> - not fully sure how long halting takes($\rho$ depends on $w_f$)
    >--though pratically fast

###### $\rightarrow$ what if $D$ not linear separable?(How to make $g \approx f$ while noise data exist?)

### - Pocket Algorithm
![](https://i.imgur.com/PrLtyEd.png)

## Linear Regression Problem
### - What is Linear Regression?
- For **x**=($x_0,x_1,x_2,...,x_d$)'features of customer',approximate the desired credit limit with a weighted sum : $y\approx\sum\limits_{i=0}^d w_ix_i$
- linear regression hypothesis: h(x)=$w^Tx$

h(x):like perceptron,but without 'sign'

### - The Error Measure
popular error measure: 'square error'
|in-sample |out-sample|
| :------: | :------: |
|$E_{in}(w)=\frac{1}{N}\sum\limits_{n=1}^N(\underbrace{h(x_n)}_{w^TX_n}-y_n)^2$|$E_{out}(w)=\epsilon(w^Tx-y)^2$|

### - Minimize the $E_{in}(w)$
1. Matrix Form of $E_{in}(w)$

![](https://i.imgur.com/cNmR6cg.png)

=> all vectors can express as a single vector

2. Gradient descent

![](https://i.imgur.com/JiRoXw4.png)

![](https://i.imgur.com/kzJn3rE.png)

![](https://i.imgur.com/n3iHxKe.jpg)

### - Is it a Learning Algorithm?

![](https://i.imgur.com/b98YJuh.png)

![](https://i.imgur.com/JDvDX7A.png)

![](https://i.imgur.com/SL8LWdh.png)

![](https://i.imgur.com/28QW9IS.png)

### - Linear classification

{-1,+1} $\subset \mathbb{R}$ : liner regression for classification
1. run LinReg on binary classification data *D* (efficient)
2. return g(x)=sign($w_{LIN}^T x$)

![](https://i.imgur.com/tmIRcQM.png)
$err_{0/1}\leq err_{sqr}$

=>classification $E_{out}(w) \leq$classification $E_{in}(w)+\sqrt{......} \leq$regression $E_{in}(w)+\sqrt{......}$

- (loose) upper bound $err_{sqr}$ as $\hat{err}$ to approximate $err_{0/1}$
- trade bound tightness for efficiency


**$w_{LIN}$:useful baseline classifer, or as initial PLA/pocket vector**

## Logistic Regression
### - What is Logistic Regression?
'soft' binary classification:
$$f(x)=P(+1|x)\in[0,1]$$

Different from classic binary classification,the 'soft binary classification' wants to know the probabilities of *y*([0,1]),not 'yes/no'.

- For $x=(x_0,x_1,x_2,...,x_n)$'features of patient',calculate a weighted 'risk score':
$$s=\sum\limits_{i=0}^d w_ix_i$$
- convert the score to estimated probability by logistic function $\theta(s)$

Logistic hypothesis:$$h(x)=\theta(w^Tx)$$

### - Logistic Function
$$\theta(s)=\frac{e^s}{1+e^s}=\frac{1}{1+e^{-s}}$$
---smooth,monotonic,sigmoid function of s
![](https://i.imgur.com/JE2dYl9.png)
Logistic Regression: use
$$h(x)=\frac{1}{1+exp(-w^Tx)}$$
to approximate target function $f(x)=P(y|x)$

### - Error measure
Likelihood:
![](https://i.imgur.com/lVnUmH1.png)

![](https://i.imgur.com/mJHrjji.png)

Cross-Entropy Error:

$max\quad likelihood(logistic\quad h)\propto\prod_{n=1}^N h(y_nx_n)\\=>max\quad likelihood(w)\propto\prod_{n=1}^N \theta(y_nw^Tx_n)\\=> max\quad ln\prod_{n=1}^N \theta(y_nw^Tx_n)\quad[product->sum]\\=>min \quad \frac{1}{N} \sum\limits_{n=1}^N -ln \theta(y_nw^Tx_n)$
\
$\theta(s)=\frac{1}{1+exp(-s)}\quad:\quad min\quad \frac{1}{N} \sum\limits_{n=1}^N -ln \left(1+exp(-y_nw^Tx_n)\right) \\ =>min \quad\underbrace{\frac{1}{N} \sum\limits_{n=1}^Nerr(w,x_n,y_n)}_{E_{in}(w)}$

> **$err(w,x,y)=ln(1+exp(-y wx)):$cross-entropy error**

### - Gradient descent of Logistic Regression Error
1. the gradient if $E_{in}(w)$

![](https://i.imgur.com/5L3PkuI.png)
2. Minimizing $E_{in}(w)$

![](https://i.imgur.com/6SbAkPX.png)
3. iterative optimization approach

![](https://i.imgur.com/FO0PY5l.png)

![](https://i.imgur.com/cZOzjQZ.png)

![](https://i.imgur.com/P3cGYT4.png)

4.chose of $\eta$

![](https://i.imgur.com/fCONAKu.png)

![](https://i.imgur.com/RlemgIA.png)

### - Summary of logistic regression algorithm
![](https://i.imgur.com/BwNDP6L.png)

### - Binary classification

![](https://i.imgur.com/wZ4VdqI.jpg)

![](https://i.imgur.com/LnzEL9i.png)

![](https://i.imgur.com/JE4bFkm.png)

![](https://i.imgur.com/AkQ3mW4.jpg)

![](https://i.imgur.com/ifhIQeD.png)

### - Multiclass Classification
1. OVA(one versus all at a time)

![](https://i.imgur.com/WTzJzBk.png)

2. OVO(one versus one at a time)

![](https://i.imgur.com/aeUNsmy.png)

![](https://i.imgur.com/dsTAlc0.png)

### - Nonelinear Transformation
#### quadratic hypothesis

![](https://i.imgur.com/tx5VvXd.png)

![](https://i.imgur.com/brYFgUN.png)

![](https://i.imgur.com/Aedv8sh.png)

![](https://i.imgur.com/YAonOUi.png)

## How to make learning better
### Feature Transformation、Overfitting、Validation:
https://www.ycc.idv.tw/ml-course-foundations_4.html
### Regularization:
https://medium.com/chung-yi/ml%E5%85%A5%E9%96%80-%E5%8D%81%E4%BA%94-regularization-solving-overfitting-9d000e3dd561


### Solving methods of overfitting
some data are with big error,then we have some solutions below:
- correct the label(**data cleaning**)
- remove the example(**data pruning**)
- add virtual examples by shifting/rotating the given data(**data hinting**)
- add some constrait(**data regularization**)


## Noun definition 
---
1. hypothesis: 假設出的函式
2. statistics: 統計學
3. perceptron: 感測器(神經網絡)
4. threshold: 臨界 
5. Supervised Learning:
> 監督式學習(Supervised)(分類、迴歸)
> 非監督式學習(Unsupervised)(分群)
> 半監督式學習(Semi-supervised)
> 強化學習(Reinforcement)(分類)
6. i.i.d.: 指一組隨機變數中每個變數的機率分布都相同，且這些隨機變數互相獨立
7. PAC: probably approximately correct
8. shatter: 成長函數
9. dichotomy: 可分類的狀況數量
10. growth function: $max|\mathcal{H}(x_1,x_2,…,x_N)|$ -> 可得到dichotomies
11. Gradient descent: 梯度下降
12. pseudo-inverse: 擬反矩陣 
13. w.r.t.: 關於
14. analytic solution: An analytical solution involves framing the problem in a well-understood form and calculating the exact solution.
15. monotonic,sigmoid function:單調、S型函數
16. Maximum Likelihood Estimation (MLE）最大概似估計 也稱極大概似估計
17. ratio: 比值
