import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalDocumentPage,
  LegalSection,
} from "@/app/_components/legal-document-page";

export const metadata: Metadata = {
  title: "Termos de Uso | Sistema de Despacho",
  description:
    "Regras simples para criação de conta e uso seguro do Sistema de Despacho.",
};

export default function TermsPage() {
  return (
    <LegalDocumentPage
      eyebrow="Regras para uso responsável"
      title="Termos de Uso"
      introduction="Estes termos apresentam as condições essenciais para criar uma conta e utilizar o Sistema de Despacho de forma segura e responsável."
    >
      <LegalSection title="1. Aceitação">
        <p>
          Ao criar uma conta, entrar com Google, receber um acesso de sua
          organização ou utilizar o Sistema de Despacho, você declara que leu e
          concorda com estes Termos de Uso e com a nossa{" "}
          <Link
            className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4"
            href="/privacidade"
          >
            Política de Privacidade
          </Link>
          . Se você usa o sistema em nome de uma organização, deve possuir
          autorização para atuar nesse ambiente.
        </p>
      </LegalSection>

      <LegalSection title="2. Finalidade do Sistema de Despacho">
        <p>
          O sistema apoia rotinas de expedição e controle operacional, como
          bipagem de pacotes, criação e finalização de lotes, romaneios,
          cancelamentos, cadastros, relatórios, gestão de usuários e auditoria das
          ações realizadas.
        </p>
        <p>
          O sistema auxilia a operação, mas não substitui a conferência física dos
          pacotes, documentos fiscais, regras de transportadoras ou obrigações da
          organização responsável pela expedição.
        </p>
      </LegalSection>

      <LegalSection title="3. Conta e autenticação">
        <p>
          Você pode acessar o serviço pelos métodos disponibilizados, incluindo
          e-mail e senha ou autenticação Google. No acesso Google, usamos somente
          nome, e-mail e foto de perfil para autenticar e criar ou vincular sua
          conta. Não acessamos Gmail, Drive, Agenda/Calendar ou outros conteúdos
          da Conta Google.
        </p>
        <p>
          As informações da conta devem ser verdadeiras e atualizadas. O acesso é
          pessoal: você não deve compartilhar senha, sessão ou meios de
          autenticação. Ações realizadas enquanto sua conta estiver autenticada
          poderão ser atribuídas a você nos registros de auditoria.
        </p>
      </LegalSection>

      <LegalSection title="4. Permissões e responsabilidade da organização">
        <p>
          Administradores podem cadastrar usuários, definir permissões, suspender
          acessos e consultar registros relacionados à operação de sua conta. Cada
          pessoa deve utilizar apenas as funções necessárias ao seu trabalho.
        </p>
        <p>
          A organização é responsável por revisar seus usuários e permissões,
          remover acessos que deixaram de ser necessários e garantir que os dados
          operacionais inseridos sejam legítimos e adequados.
        </p>
      </LegalSection>

      <LegalSection title="5. Uso permitido">
        <p>Ao usar o sistema, você concorda em não:</p>
        <ul className="grid list-disc gap-2 pl-5 marker:text-teal-700">
          <li>tentar acessar dados, contas ou funções sem autorização;</li>
          <li>inserir códigos ou informações de forma fraudulenta ou enganosa;</li>
          <li>contornar controles de segurança, permissões ou auditoria;</li>
          <li>interferir na disponibilidade do serviço ou introduzir código malicioso;</li>
          <li>usar o sistema para violar direitos de terceiros ou a legislação.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Disponibilidade e mudanças">
        <p>
          Buscamos manter o serviço seguro e disponível, mas podem ocorrer
          interrupções por manutenção, atualização, falhas de internet,
          fornecedores ou eventos fora do controle razoável. Funcionalidades podem
          ser ajustadas para melhorar desempenho, segurança ou conformidade.
        </p>
        <p>
          Quando possível, mudanças relevantes serão comunicadas dentro do
          sistema. É responsabilidade do usuário conferir os dados e resultados
          importantes antes de concluir uma operação crítica.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspensão e encerramento">
        <p>
          Um acesso pode ser suspenso ou encerrado pelo administrador da
          organização, por solicitação do titular, por risco de segurança, uso
          indevido ou descumprimento destes termos. Registros operacionais e de
          auditoria já existentes podem ser preservados conforme descrito na
          Política de Privacidade.
        </p>
      </LegalSection>

      <LegalSection title="8. Privacidade e segurança">
        <p>
          O tratamento de dados pessoais segue a{" "}
          <Link
            className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4"
            href="/privacidade"
          >
            Política de Privacidade
          </Link>
          . Você deve comunicar imediatamente suspeitas de acesso indevido e
          colaborar com medidas razoáveis de proteção e recuperação da conta.
        </p>
      </LegalSection>

      <LegalSection title="9. Atualizações destes termos e contato">
        <p>
          Estes termos podem ser atualizados para acompanhar mudanças do serviço
          ou requisitos legais. A data da versão vigente aparece no início da
          página. O uso após a entrada em vigor de uma nova versão representa a
          aceitação das condições atualizadas, sem prejuízo dos direitos previstos
          em lei.
        </p>
        <p>
          Para dúvidas, solicitações ou problemas de acesso, escreva para{" "}
          <a
            className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4"
            href="mailto:jefersondr10@gmail.com"
          >
            jefersondr10@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocumentPage>
  );
}
