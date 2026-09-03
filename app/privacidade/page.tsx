import type { Metadata } from "next";

import {
  LegalDocumentPage,
  LegalSection,
} from "@/app/_components/legal-document-page";

export const metadata: Metadata = {
  title: "Política de Privacidade | Sistema de Despacho",
  description:
    "Saiba como o Sistema de Despacho usa e protege os dados de autenticação e os dados operacionais.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Privacidade e proteção de dados"
      title="Política de Privacidade"
      introduction="Esta política explica, em linguagem clara, quais dados o Sistema de Despacho utiliza, por que eles são necessários e como você pode exercer seus direitos."
    >
      <LegalSection title="1. Quem é responsável e a quem esta política se aplica">
        <p>
          O Sistema de Despacho é uma ferramenta operacional para organização de
          bipagens, pacotes, lotes, romaneios, cancelamentos e relatórios. Esta
          política se aplica às pessoas que criam uma conta ou utilizam uma conta
          disponibilizada por sua organização.
        </p>
        <p>
          O canal do responsável pelo tratamento para dúvidas e solicitações de
          privacidade é{" "}
          <a
            className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4"
            href="mailto:jefersondr10@gmail.com"
          >
            jefersondr10@gmail.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Dados usados ao entrar com Google">
        <p>
          Quando você escolhe “Continuar com Google”, usamos somente seu nome,
          endereço de e-mail e foto de perfil disponibilizados pelo Google. Esses
          dados servem exclusivamente para autenticar você e criar ou vincular sua
          conta no Sistema de Despacho.
        </p>
        <p className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 font-semibold text-teal-900">
          Não acessamos, lemos ou armazenamos mensagens do Gmail, arquivos do
          Google Drive, eventos do Google Agenda/Calendar, contatos ou qualquer
          outro conteúdo da sua Conta Google.
        </p>
        <p>
          O botão do Google é opcional. O acesso por e-mail e senha continua
          disponível conforme a configuração da sua conta.
        </p>
      </LegalSection>

      <LegalSection title="3. Outros dados tratados no uso do sistema">
        <p>
          Conforme as permissões concedidas à sua conta, podemos tratar dados de
          cadastro, loja, marketplace, transportadora, códigos de rastreio,
          sessões de bipagem, lotes, romaneios, cancelamentos, relatórios,
          feedbacks e registros de auditoria das ações realizadas.
        </p>
        <p>
          Também são usados dados técnicos estritamente necessários para manter
          sua sessão, proteger o acesso e diagnosticar falhas, como identificadores
          de sessão, data e hora de eventos e informações básicas do navegador ou
          dispositivo. Cookies ou armazenamento local essenciais podem ser usados
          para manter o login e as preferências funcionais.
        </p>
      </LegalSection>

      <LegalSection title="4. Finalidades e bases de uso">
        <p>Utilizamos os dados para:</p>
        <ul className="grid list-disc gap-2 pl-5 marker:text-teal-700">
          <li>criar, autenticar, recuperar e proteger contas;</li>
          <li>executar as funções operacionais solicitadas no sistema;</li>
          <li>aplicar permissões e registrar quem realizou cada ação;</li>
          <li>prevenir fraude, abuso, duplicidade e acesso indevido;</li>
          <li>manter, diagnosticar e melhorar a segurança e a confiabilidade.</li>
        </ul>
        <p>
          O tratamento necessário para fornecer o acesso e as funções solicitadas
          se apoia na execução dos Termos de Uso e de procedimentos relacionados
          ao serviço. Medidas de segurança, prevenção a abuso e auditoria se
          apoiam no cumprimento de obrigações aplicáveis e no interesse legítimo
          de proteger usuários, operações e a plataforma, sempre com respeito aos
          direitos dos titulares.
        </p>
      </LegalSection>

      <LegalSection title="5. Armazenamento e compartilhamento limitado">
        <p>
          Os dados do Sistema de Despacho são armazenados em backend próprio,
          hospedado na infraestrutura contratada da Hostinger. A autenticação é
          operada com componentes Supabase self-hosted no mesmo ambiente, sob
          controle do sistema.
        </p>
        <p>
          Não vendemos dados pessoais. O compartilhamento é limitado aos
          prestadores e componentes essenciais para operar o serviço: Google,
          quando você usa a autenticação Google; Hostinger, como infraestrutura de
          hospedagem; e os componentes Supabase self-hosted usados pelo backend e
          pela autenticação. Eles recebem somente o necessário para sua função e
          estão sujeitos às suas próprias regras de segurança e privacidade.
        </p>
        <p>
          Dados também poderão ser apresentados por exigência legal ou ordem de
          autoridade competente, dentro dos limites aplicáveis.
        </p>
      </LegalSection>

      <LegalSection title="6. Retenção e exclusão">
        <p>
          Mantemos os dados enquanto a conta estiver ativa e pelo período
          necessário para cumprir as finalidades operacionais, preservar
          auditorias, prevenir fraude, resolver disputas e atender obrigações
          legais. Quando não houver mais finalidade legítima, os dados serão
          eliminados ou anonimizados de forma segura, salvo quando a conservação
          for exigida ou permitida por lei.
        </p>
        <p>
          A desativação de uma conta pode não apagar imediatamente registros
          operacionais e de auditoria vinculados ao trabalho já realizado, pois
          eles podem ser necessários para manter a integridade do histórico da
          organização.
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança">
        <p>
          Adotamos medidas técnicas e organizacionais compatíveis com o serviço,
          incluindo conexão criptografada, controle de acesso por conta e
          permissões, separação de serviços, registros de auditoria e rotinas de
          backup. Nenhum sistema é totalmente imune a riscos, mas incidentes são
          avaliados e tratados com prioridade.
        </p>
        <p>
          Você também deve proteger sua senha, seu dispositivo e sua Conta Google,
          encerrar sessões em aparelhos compartilhados e comunicar qualquer uso
          suspeito.
        </p>
      </LegalSection>

      <LegalSection title="8. Seus direitos">
        <p>
          Você pode solicitar confirmação do tratamento, acesso, correção,
          informações sobre uso e compartilhamento, portabilidade quando
          aplicável, oposição ou revisão, além da eliminação de dados tratados com
          consentimento quando cabível. Também pode pedir a desvinculação do login
          Google; nesse caso, talvez seja necessário configurar outra forma de
          acesso para continuar usando o sistema.
        </p>
        <p>
          Envie a solicitação para{" "}
          <a
            className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4"
            href="mailto:jefersondr10@gmail.com"
          >
            jefersondr10@gmail.com
          </a>
          . Poderemos solicitar confirmação de identidade para proteger a conta.
        </p>
      </LegalSection>

      <LegalSection title="9. Alterações desta política">
        <p>
          Esta política pode ser atualizada para refletir melhorias do sistema,
          mudanças de fornecedores ou requisitos legais. A data da versão vigente
          permanecerá indicada no início desta página e alterações relevantes
          poderão ser comunicadas dentro do sistema.
        </p>
      </LegalSection>
    </LegalDocumentPage>
  );
}
